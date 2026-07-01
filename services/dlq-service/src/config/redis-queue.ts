import Redis from 'ioredis';

import { env } from './env';
import { logger } from './logger';

export class DlqRedisQueue {
  private client: Redis | null = null;
  private connecting = false;
  private connected = false;
  private readonly queueKey: string;
  private popScriptHash: string | null = null;
  private onReconnectCb: (() => void) | null = null;
  private wasEverConnected = false;

  private static readonly POP_SCRIPT = `
    local entries = redis.call('LRANGE', KEYS[1], -1, -1)
    if #entries > 0 then
      redis.call('LTRIM', KEYS[1], 0, -2)
    end
    return entries
  `;

  constructor(queueKey = 'dlq:queue') {
    this.queueKey = queueKey;
  }

  async connect(): Promise<boolean> {
    if (this.client && this.connected) return true;
    if (this.connecting) return false;

    if (this.client && !this.connected) {
      await this.close();
    }

    this.connecting = true;
    try {
      const url = env.REDIS_URL;
      if (!url) {
        logger.info('No REDIS_URL configured — Redis queue unavailable');
        this.connected = false;
        return false;
      }
      this.client = new Redis(url, {
        lazyConnect: true,
        retryStrategy: times => {
          const delay = Math.min(times * 200, 5_000);
          return delay;
        },
      });
      this.client.on('connect', () => {
        this.connected = true;
        if (this.wasEverConnected) {
          logger.info('Redis queue reconnected — triggering queue rebuild');
          this.onReconnectCb?.();
        }
        this.wasEverConnected = true;
      });
      this.client.on('close', () => {
        this.connected = false;
      });
      this.client.on('error', err => {
        logger.error('Redis queue client error', { error: err.message });
        this.connected = false;
      });
      await this.client.connect();
      this.connected = true;
      this.wasEverConnected = true;
      return true;
    } catch (err) {
      logger.warn('Redis queue unavailable — falling back to MongoDB polling', {
        error: (err as Error).message,
      });
      this.client = null;
      this.connected = false;
      return false;
    } finally {
      this.connecting = false;
    }
  }

  async push(entryId: string, maxQueueSize = 50_000): Promise<boolean> {
    if (!this.client || !this.connected) return false;
    try {
      const size = await this.client.llen(this.queueKey);
      if (size >= maxQueueSize) {
        logger.warn('Redis queue size limit reached — dropping push', {
          queueKey: this.queueKey,
          size,
          maxSize: maxQueueSize,
        });
        return false;
      }
      await this.client.lpush(this.queueKey, entryId);
      return true;
    } catch {
      return false;
    }
  }

  async pop(): Promise<string | null> {
    if (!this.client || !this.connected) return null;
    try {
      if (!this.popScriptHash) {
        this.popScriptHash = (await this.client.script('LOAD', DlqRedisQueue.POP_SCRIPT)) as string;
      }
      const result = await this.client.evalsha(this.popScriptHash!, 1, this.queueKey);
      const entries = result as string[];
      return entries.length > 0 ? (entries[0] ?? null) : null;
    } catch {
      return null;
    }
  }

  setOnReconnect(cb: () => void): void {
    this.onReconnectCb = cb;
  }

  isAvailable(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.client) {
      try {
        if (this.client.status === 'ready') {
          await this.client.quit();
        } else {
          this.client.disconnect();
        }
      } catch {
        this.client.disconnect();
      }
      this.client.removeAllListeners();
      this.client = null;
    }
    this.connected = false;
    this.popScriptHash = null;
  }
}

export const dlqRedisQueue = new DlqRedisQueue();
