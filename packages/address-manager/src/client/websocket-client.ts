import WebSocket from 'ws';
import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

export type WsMessageType = 'heartbeat' | 'register' | 'subscribe' | 'cache.invalidate';

export interface WsMessage {
  type: WsMessageType;
  payload: Record<string, unknown>;
}

export type WsEventHandler = (message: WsMessage) => void;

export class WebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly url: string;
  private readonly reconnectIntervalMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly subscribedServices: string[];
  private reconnectAttempts = 0;
  private shouldReconnect = true;
  private eventHandler: WsEventHandler | null = null;

  constructor(
    url: string,
    reconnectIntervalMs: number = 5000,
    maxReconnectAttempts: number = 10,
    subscribedServices: string[] = ['*']
  ) {
    this.url = url;
    this.reconnectIntervalMs = reconnectIntervalMs;
    this.maxReconnectAttempts = maxReconnectAttempts;
    this.subscribedServices = subscribedServices;
  }

  onMessage(handler: WsEventHandler): void {
    this.eventHandler = handler;
  }

  connect(): void {
    if (this.ws) return;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.on('open', () => {
        this.reconnectAttempts = 0;
        logger.info('WebSocket connected to discovery server', { url: this.url });
        this.send('subscribe', { services: this.subscribedServices });
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString()) as WsMessage;
          this.eventHandler?.(message);
        } catch (err) {
          logger.warn('Failed to parse WebSocket message', { data: data.toString(), err: normalizeError(err) });
        }
      });

      this.ws.on('close', () => {
        this.ws = null;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        logger.error('WebSocket error', { error: normalizeError(error) });
      });
    } catch (error) {
      logger.error('WebSocket connection failed', { error: normalizeError(error) });
      this.ws = null;
      this.scheduleReconnect();
    }
  }

  send(type: WsMessageType, payload: Record<string, unknown>): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;

    const message: WsMessage = { type, payload };
    this.ws.send(JSON.stringify(message));
    return true;
  }

  disconnect(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.warn('WebSocket max reconnect attempts reached', {
        url: this.url,
        attempts: this.reconnectAttempts,
      });
      return;
    }
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectIntervalMs);
  }

  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }
}
