import * as https from 'https';
import * as fs from 'node:fs';

import { context, propagation } from '@opentelemetry/api';
import WebSocket from 'ws';

import { logger } from '@trading-model/common/config/logger';
import { MessageMetadata } from '@trading-model/common/contracts/message.types';
import { normalizeError } from '@trading-model/common/utils/errors';

const WSS_RECONNECT_BASE_MS = 1000;
const WSS_RECONNECT_MAX_MS = 30000;
const WSS_MAX_RECONNECT_ATTEMPTS = 20;
const WSS_RECONNECT_POLL_INTERVAL_MS = 60_000;

const HTTP_RETRY_BASE_MS = 500;
const HTTP_RETRY_MAX_MS = 15000;
const HTTP_RETRY_MAX_ATTEMPTS = 5;

export type WssMessageHandler = (topic: string, payload: unknown, metadata: MessageMetadata) => void;

interface PendingPublish {
  payload: unknown;
  metadata: MessageMetadata;
  resolve: () => void;
  reject: (err: Error) => void;
  timestamp: number;
}

const WSS_PENDING_QUEUE_MAX = 1000;

type FallbackPublishFn = (payload: unknown, metadata: MessageMetadata) => Promise<void>;

export class WssClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private permanentlyFellBack = false;
  private reconnectPollTimer: ReturnType<typeof setInterval> | null = null;
  private messageHandler: WssMessageHandler | null = null;
  private pendingQueue: PendingPublish[] = [];
  private flusherTimer: ReturnType<typeof setInterval> | null = null;
  private wsUrl: string;
  private httpFallbackUrl: string;
  private tlsCa?: string;
  private tlsCert?: string;
  private tlsKey?: string;
  private serviceName: string;
  private instanceId: string;
  private subscribedTopics: string[] = [];
  private connected = false;
  private httpFallback: FallbackPublishFn | null = null;

  constructor(
    config: {
      wssUrl: string;
      httpFallbackUrl: string;
      tlsConfig: { ca?: string; cert?: string; key?: string };
      serviceName: string;
      instanceId: string;
    }
  ) {
    this.wsUrl = config.wssUrl;
    this.httpFallbackUrl = config.httpFallbackUrl;
    this.serviceName = config.serviceName;
    this.instanceId = config.instanceId;
    this.tlsCa = config.tlsConfig.ca ? fs.readFileSync(config.tlsConfig.ca, 'utf8') : undefined;
    this.tlsCert = config.tlsConfig.cert ? fs.readFileSync(config.tlsConfig.cert, 'utf8') : undefined;
    this.tlsKey = config.tlsConfig.key ? fs.readFileSync(config.tlsConfig.key, 'utf8') : undefined;
    this.startFlusher();
  }

  private buildWsUrl(): string {
    const url = new URL(this.wsUrl);
    url.searchParams.set('service', this.serviceName);
    url.searchParams.set('instance', this.instanceId);
    return url.toString();
  }

  connect(topics: string[] = []): void {
    this.subscribedTopics = topics;
    this.shouldReconnect = true;
    this.connectWs();
  }

  private connectWs(): void {
    if (this.ws) {
      try { this.ws.close(); } catch { logger.warn('Failed to close existing WSS connection'); }
      this.ws = null;
    }

    const wsUrl = this.buildWsUrl();
    logger.info('WSS connecting', { url: wsUrl, attempt: this.reconnectAttempts + 1 });

    try {
      const tlsConfig: https.AgentOptions = {};
      let agent: https.Agent | undefined;

      if (this.tlsCa) {
        tlsConfig.ca = this.tlsCa;
        tlsConfig.cert = this.tlsCert;
        tlsConfig.key = this.tlsKey;
        agent = new https.Agent(tlsConfig);
      }

      this.ws = new WebSocket(wsUrl, { agent });

      this.ws.on('open', () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        logger.info('WSS connected');

        if (this.subscribedTopics.length > 0) {
          this.sendJson({ type: 'subscribe', topics: this.subscribedTopics });
        }

        this.flushPending();
      });

      this.ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'message' && msg.topic) {
            this.messageHandler?.(msg.topic, msg.message?.payload, msg.message?.metadata);
          } else if (msg.type === 'connected') {
            logger.info('WSS handshake complete', { brokerInstance: msg.instanceId });
          } else if (msg.type === 'subscribed') {
            logger.info('WSS topics subscribed', { topics: msg.topics });
          } else if (msg.type === 'error') {
            logger.warn('WSS server error', { message: msg.message });
          }
        } catch (err) {
          logger.warn('WSS message parse error', { error: normalizeError(err as Error) });
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        this.connected = false;
        this.ws = null;
        const reasonStr = reason?.toString() || 'unknown';
        logger.warn('WSS disconnected', { code, reason: reasonStr });
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.connected = false;
        logger.warn('WSS error', { error: err.message });
        if (this.ws) {
          try { this.ws.close(); } catch { /* ignore */ }
          this.ws = null;
        }
        this.scheduleReconnect();
      });
    } catch (err) {
      this.connected = false;
      logger.warn('WSS connection failed', { error: normalizeError(err as Error) });
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= WSS_MAX_RECONNECT_ATTEMPTS) {
      if (!this.permanentlyFellBack) {
        this.permanentlyFellBack = true;
        logger.warn('WSS max reconnect attempts reached, falling back to HTTP — will periodically retry WSS');
        this.flushAllPendingToHttp();
        this.startReconnectPolling();
      }
      return;
    }
    this.reconnectAttempts++;
    const delay = Math.min(
      WSS_RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts),
      WSS_RECONNECT_MAX_MS
    ) + Math.random() * 1000;

    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connectWs();
      }
    }, delay);
  }

  private startReconnectPolling(): void {
    if (this.reconnectPollTimer) return;
    this.reconnectPollTimer = setInterval(() => {
      if (!this.shouldReconnect) {
        this.stopReconnectPolling();
        return;
      }
      logger.info('WSS reconnect poll — attempting to re-establish WebSocket connection');
      this.reconnectAttempts = 0;
      this.permanentlyFellBack = false;
      this.connectWs();
    }, WSS_RECONNECT_POLL_INTERVAL_MS);
    this.reconnectPollTimer.unref();
  }

  private stopReconnectPolling(): void {
    if (this.reconnectPollTimer) {
      clearInterval(this.reconnectPollTimer);
      this.reconnectPollTimer = null;
    }
  }

  private flushAllPendingToHttp(): void {
    const pending = this.pendingQueue.splice(0, this.pendingQueue.length);
    for (const entry of pending) {
      if (this.httpFallback) {
        this.retryHttpFallback(entry, 0);
      } else {
        entry.reject(new Error('WSS disconnected and no HTTP fallback configured'));
      }
    }
  }

  private retryHttpFallback(entry: PendingPublish, attempt: number): void {
    if (!this.httpFallback) {
      entry.reject(new Error('WSS disconnected and no HTTP fallback configured'));
      return;
    }
    this.httpFallback(entry.payload, entry.metadata).then(() => {
      entry.resolve();
    }).catch((err) => {
      if (attempt < HTTP_RETRY_MAX_ATTEMPTS) {
        const delay = Math.min(
          HTTP_RETRY_BASE_MS * Math.pow(2, attempt),
          HTTP_RETRY_MAX_MS
        );
        logger.warn(`HTTP fallback attempt ${attempt + 1} failed, retrying in ${delay}ms`, {
          error: normalizeError(err),
        });
        setTimeout(() => this.retryHttpFallback(entry, attempt + 1), delay).unref();
      } else {
        logger.error('HTTP fallback max retries exceeded', {
          error: normalizeError(err),
        });
        entry.reject(new Error('HTTP fallback failed after max retries'));
      }
    });
  }

  setHttpFallback(fn: FallbackPublishFn): void {
    this.httpFallback = fn;
  }

  onMessage(handler: WssMessageHandler): void {
    this.messageHandler = handler;
  }

  private sendJson(data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try {
      this.ws.send(JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }

  async publish(payload: unknown, metadata: MessageMetadata): Promise<void> {
    const carrier: Record<string, string> = {};
    propagation.inject(context.active(), carrier);
    const traceparent = carrier['traceparent'];

    if (this.connected && this.sendJson({ type: 'publish', payload, metadata, traceparent })) {
      return;
    }

    if (this.httpFallback) {
      if (this.pendingQueue.length >= WSS_PENDING_QUEUE_MAX) {
        return this.retryHttpFallback({ payload, metadata, resolve: () => {}, reject: () => {}, timestamp: Date.now() }, 0);
      }
      return new Promise<void>((resolve, reject) => {
        this.pendingQueue.push({ payload, metadata, resolve, reject, timestamp: Date.now() });
      });
    }

    return Promise.reject(new Error('WSS not connected and no HTTP fallback'));
  }

  private flushPending(): void {
    const batch = this.pendingQueue.splice(0, this.pendingQueue.length);

    const httpBatch: PendingPublish[] = [];
    for (const entry of batch) {
      if (this.connected && this.sendJson({ type: 'publish', payload: entry.payload, metadata: entry.metadata })) {
        entry.resolve();
      } else if (this.httpFallback) {
        httpBatch.push(entry);
      } else {
        entry.reject(new Error('WSS not connected'));
      }
    }

    for (const entry of httpBatch) {
      this.retryHttpFallback(entry, 0);
    }
  }

  private startFlusher(): void {
    this.flusherTimer = setInterval(() => {
      if (this.pendingQueue.length > 0) {
        this.flushPending();
      }
    }, 50);
    this.flusherTimer.unref();
  }

  async subscribe(topics: string[]): Promise<void> {
    this.subscribedTopics = [...new Set([...this.subscribedTopics, ...topics])];
    if (this.connected) {
      this.sendJson({ type: 'subscribe', topics });
    }
  }

  async unsubscribe(topics: string[]): Promise<void> {
    this.subscribedTopics = this.subscribedTopics.filter(t => !topics.includes(t));
    if (this.connected) {
      this.sendJson({ type: 'unsubscribe', topics });
    }
  }

  ack(messageId: string): boolean {
    return this.sendJson({ type: 'ack', messageId });
  }

  nack(messageId: string): boolean {
    return this.sendJson({ type: 'nack', messageId });
  }

  isConnected(): boolean {
    return this.connected;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    this.stopReconnectPolling();
    if (this.flusherTimer) {
      clearInterval(this.flusherTimer);
      this.flusherTimer = null;
    }
    const pending = this.pendingQueue.splice(0, this.pendingQueue.length);
    for (const entry of pending) {
      this.retryHttpFallback(entry, 0);
    }
    if (this.ws) {
      try { this.ws.close(1000, 'Client shutdown'); } catch { /* ignore */ }
      this.ws = null;
    }
    this.connected = false;
  }
}