import { IncomingMessage } from 'http';
import { Server as HttpsServer } from 'https';

import { context, propagation } from '@opentelemetry/api';
import WebSocket, { WebSocketServer } from 'ws';

import { MessageMetadata } from '@trading-model/common/contracts/message.types';
import { LruCache } from '@trading-model/common/utils/lru-cache';

import { Deque } from './deque';
import { env } from '../../config/env';
import { logger } from '../../config/logger';
import { getStreamClient } from '../../config/redis';
import { authorizeTopic } from '../core/acl';
import { Dispatcher } from '../core/dispatcher';

interface WsSubscription {
  instanceId: string;
  serviceName: string;
  topics: Set<string>;
  ws: WebSocket;
}

const MAX_WSS_CONNECTIONS = 10000;
const WSS_RATE_LIMIT_WINDOW_MS = 60_000;
const WSS_RATE_LIMIT_MAX_PER_WINDOW = 10000;
const WSS_RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;
const WSS_SERVICE_STALE_MS = 120_000;
const WSS_SHUTDOWN_TIMEOUT_MS = 5_000;

interface RateLimitEntry {
  timestamps: Deque<number>;
  lastSeen: number;
}

interface IncomingWssMessage {
  type: string;
  instanceId?: string;
  topics?: string[];
  payload?: unknown;
  metadata?: unknown;
  traceparent?: string;
  messageId?: string;
}

type MessageHandler = (msg: IncomingWssMessage, ws: WebSocket, ctx: {
  instanceId: string;
  serviceName: string;
  topics: Set<string>;
  subKey: string;
}) => Promise<void> | void;

export class WssTransport {
  private wss: WebSocketServer | null = null;
  private subscriptions = new Map<string, WsSubscription>();
  private dispatcher: Dispatcher;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private processedWssDeduplicationIds = new LruCache<true>(50000, 300_000);
  private rateLimitWindows = new Map<string, RateLimitEntry>();

  constructor(dispatcher: Dispatcher) {
    this.dispatcher = dispatcher;
  }

  private checkWssRateLimit(serviceName: string): boolean {
    const now = Date.now();
    let entry = this.rateLimitWindows.get(serviceName);
    if (!entry) {
      entry = { timestamps: new Deque<number>(), lastSeen: now };
      this.rateLimitWindows.set(serviceName, entry);
    }

    entry.lastSeen = now;
    const { timestamps } = entry;
    const cutoff = now - WSS_RATE_LIMIT_WINDOW_MS;
    while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= WSS_RATE_LIMIT_MAX_PER_WINDOW) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  private ensureCleanupTimer(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - WSS_RATE_LIMIT_WINDOW_MS;
      const staleCutoff = now - WSS_SERVICE_STALE_MS;
      for (const [key, entry] of this.rateLimitWindows) {
        const { timestamps } = entry;
        while (timestamps.length > 0 && timestamps.peekFront()! < cutoff) {
          timestamps.shift();
        }
        if (timestamps.length === 0 && entry.lastSeen < staleCutoff) {
          this.rateLimitWindows.delete(key);
        }
      }
    }, WSS_RATE_LIMIT_CLEANUP_INTERVAL_MS);
    this.cleanupTimer.unref();
  }

  // ─── Dispatch table handlers for WSS message types ──────────────────────

  private handleSubscribe(msg: IncomingWssMessage, ws: WebSocket, ctx: { instanceId: string; topics: Set<string> }): void {
    const msgInstanceId = msg.instanceId;
    if (msgInstanceId && msgInstanceId !== ctx.instanceId) {
      ws.send(JSON.stringify({ type: 'error', message: 'instanceId mismatch' }));
      return;
    }
    const rawTopics = msg.topics;
    if (!Array.isArray(rawTopics) || !rawTopics.every(t => typeof t === 'string')) {
      ws.send(JSON.stringify({ type: 'error', message: 'topics must be an array of strings' }));
      return;
    }
    for (const topic of rawTopics as string[]) {
      ctx.topics.add(topic);
    }
    ws.send(JSON.stringify({ type: 'subscribed', topics: [...ctx.topics] }));
  }

  private handleUnsubscribe(msg: IncomingWssMessage, ws: WebSocket, ctx: { instanceId: string; topics: Set<string> }): void {
    const msgInstanceId = msg.instanceId;
    if (msgInstanceId && msgInstanceId !== ctx.instanceId) {
      ws.send(JSON.stringify({ type: 'error', message: 'instanceId mismatch' }));
      return;
    }
    const rawTopics = msg.topics;
    if (!Array.isArray(rawTopics) || !rawTopics.every(t => typeof t === 'string')) {
      ws.send(JSON.stringify({ type: 'error', message: 'topics must be an array of strings' }));
      return;
    }
    for (const topic of rawTopics as string[]) {
      ctx.topics.delete(topic);
    }
    ws.send(JSON.stringify({ type: 'unsubscribed', topics: [...ctx.topics] }));
  }

  private async handlePublish(msg: IncomingWssMessage, ws: WebSocket, ctx: { instanceId: string; serviceName: string }): Promise<void> {
    if (!this.checkWssRateLimit(ctx.serviceName)) {
      ws.send(JSON.stringify({ type: 'error', message: 'Rate limit exceeded' }));
      return;
    }
    const topic = (msg.metadata as Record<string, unknown>)?.topic as string | undefined;
    if (topic) {
      const result = await authorizeTopic({ headers: { 'x-service-name': ctx.serviceName } } as never, topic);
      if (!result.allowed) {
        ws.send(JSON.stringify({ type: 'error', message: result.reason }));
        return;
      }
    }
    const wssMetadata = msg.metadata as Record<string, unknown> | undefined;
    const dedupId = (wssMetadata?.delivery as Record<string, unknown> | undefined)?.deduplicationId as string | undefined;
    if (dedupId) {
      if (this.processedWssDeduplicationIds.has(dedupId)) return;
      this.processedWssDeduplicationIds.set(dedupId, true);
      try {
        const redis = await getStreamClient();
        const key = `${env.REDIS_PREFIX}wss-dedup:${dedupId}`;
        const acquired = await redis.set(key, '1', 'EX', 300, 'NX');
        if (!acquired) return;
      } catch { /* Redis unavailable — local cache suffices */ }
    }
    const bpRatio = this.dispatcher.getBackpressureRatio();
    if (bpRatio > 0.9) {
      ws.send(JSON.stringify({ type: 'error', message: 'Server backpressure too high — try again later' }));
      return;
    }
    try {
      const traceparent = msg.traceparent as string | undefined;
      let publishPromise: Promise<string>;
      if (traceparent) {
        const carrier = { traceparent };
        const extractedCtx = propagation.extract(context.active(), carrier);
        publishPromise = context.with(extractedCtx, () =>
          this.dispatcher.publish(msg.payload, msg.metadata as Omit<MessageMetadata, 'messageId' | 'emittedAt'>)
        );
      } else {
        publishPromise = this.dispatcher.publish(msg.payload, msg.metadata as Omit<MessageMetadata, 'messageId' | 'emittedAt'>);
      }
      const messageId = await publishPromise;
      ws.send(JSON.stringify({ type: 'published', messageId }));
    } catch (err) {
      logger.warn('WSS publish error', { error: (err as Error).message });
      ws.send(JSON.stringify({ type: 'error', message: 'Publish failed' }));
    }
  }

  private handleAck(msg: IncomingWssMessage, ws: WebSocket, ctx: { instanceId: string }): void {
    if (typeof msg.messageId !== 'string') {
      ws.send(JSON.stringify({ type: 'error', message: 'messageId must be a string' }));
      return;
    }
    this.dispatcher.handleAck(msg.messageId, ctx.instanceId).catch(() => {});
  }

  private handleNack(msg: IncomingWssMessage, ws: WebSocket, ctx: { instanceId: string }): void {
    if (typeof msg.messageId !== 'string') {
      ws.send(JSON.stringify({ type: 'error', message: 'messageId must be a string' }));
      return;
    }
    this.dispatcher.handleNack(msg.messageId, ctx.instanceId).catch(() => {});
  }

  attach(server: HttpsServer): void {
    this.ensureCleanupTimer();
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      maxPayload: env.MAX_PAYLOAD_BYTES,
      verifyClient: (info, cb) => {
        const serviceName = info.req.headers['x-service-name'] as string;
        const instanceId = info.req.headers['x-instance-id'] as string;
        if (!serviceName || !instanceId) {
          cb(false, 400, 'Missing x-service-name or x-instance-id headers');
          return;
        }
        cb(true);
      },
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      if (this.subscriptions.size >= MAX_WSS_CONNECTIONS) {
        ws.close(1013, 'Server at capacity — too many WSS connections');
        return;
      }

      const serviceName = req.headers['x-service-name'] as string;
      const instanceId = req.headers['x-instance-id'] as string;
      const topicsHeader = req.headers['x-subscribed-topics'] as string;
      const topics = new Set(topicsHeader ? topicsHeader.split(',').map(t => t.trim()).filter(Boolean) : []);

      const subKey = `${serviceName}:${instanceId}`;

      logger.info('WSS client connecting', { serviceName, instanceId, topics: [...topics] });

      ws.on('message', async (raw: WebSocket.RawData) => {
        let msg: Record<string, unknown>;
        try {
          msg = JSON.parse(raw.toString());
        } catch {
          ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
          return;
        }
        if (typeof msg.type !== 'string') {
          ws.send(JSON.stringify({ type: 'error', message: 'Missing message type' }));
          return;
        }

        const incoming: IncomingWssMessage = {
          type: msg.type,
          instanceId: msg.instanceId as string | undefined,
          topics: msg.topics as string[] | undefined,
          payload: msg.payload,
          metadata: msg.metadata,
          traceparent: msg.traceparent as string | undefined,
          messageId: msg.messageId as string | undefined,
        };

        const ctx = { instanceId, serviceName, topics: topics, subKey };

        const HANDLERS = new Map<string, MessageHandler>([
          ['subscribe', this.handleSubscribe.bind(this)],
          ['unsubscribe', this.handleUnsubscribe.bind(this)],
          ['publish', this.handlePublish.bind(this)],
          ['ack', this.handleAck.bind(this)],
          ['nack', this.handleNack.bind(this)],
        ]);

        const handler = HANDLERS.get(incoming.type);
        if (handler) {
          try {
            await handler(incoming, ws, ctx);
          } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Server error processing message' }));
          }
        } else {
          ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${incoming.type}` }));
        }
      });

      ws.on('close', () => {
        this.subscriptions.delete(subKey);
        ws.removeAllListeners();
        logger.info('WSS client disconnected', { serviceName, instanceId });
      });

      ws.on('error', (err) => {
        logger.warn('WSS connection error', { error: err.message, serviceName, instanceId });
        ws.close(1011, 'Internal server error');
      });

      this.subscriptions.set(subKey, { instanceId, serviceName, topics, ws });

      ws.send(JSON.stringify({ type: 'connected', instanceId: env.BROKER_INSTANCE_ID }));
    });

    logger.info('WSS transport attached at /ws');
  }

  getSubscriber(serviceName: string, instanceId: string): WebSocket | undefined {
    return this.subscriptions.get(`${serviceName}:${instanceId}`)?.ws;
  }

  hasSubscriber(serviceName: string, instanceId: string): boolean {
    return this.subscriptions.has(`${serviceName}:${instanceId}`);
  }

  getConnectedCount(): number {
    return this.subscriptions.size;
  }

  broadcastToTopic(topic: string, message: unknown): number {
    let count = 0;
    const payload = JSON.stringify({ type: 'message', topic, message });
    const entries = [...this.subscriptions];
    for (const [key, sub] of entries) {
      if (sub.topics.has(topic) && sub.ws.readyState === WebSocket.OPEN) {
        try {
          sub.ws.send(payload);
          count++;
        } catch {
          this.subscriptions.delete(key);
        }
      }
    }
    return count;
  }

  broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    const entries = [...this.subscriptions];
    for (const [key, sub] of entries) {
      if (sub.ws.readyState === WebSocket.OPEN) {
        try {
          sub.ws.send(payload);
        } catch {
          this.subscriptions.delete(key);
        }
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.wss) {
      for (const [, sub] of this.subscriptions) {
        sub.ws.close(1001, 'Server shutdown');
      }
      this.subscriptions.clear();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          this.wss = null;
          resolve();
        }, WSS_SHUTDOWN_TIMEOUT_MS);
        this.wss!.close(() => {
          clearTimeout(timer);
          this.wss = null;
          resolve();
        });
      });
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.processedWssDeduplicationIds.clear();
    this.rateLimitWindows.clear();
  }
}
