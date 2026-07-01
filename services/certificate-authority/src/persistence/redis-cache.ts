import Redis from 'ioredis';

import { logger } from '@trading-model/common/config/logger';

export interface CacheOptions {
  ttlMs: number;
  prefix: string;
}

export class RedisCache {
  private readonly client: Redis | null;

  constructor(redisUrl?: string) {
    if (!redisUrl) {
      this.client = null;
      return;
    }
    this.client = new Redis(redisUrl, {
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      retryStrategy: times => {
        if (times > 10) return null;
        return Math.min(times * 1000, 30000);
      },
      lazyConnect: true,
    });
    this.client.on('error', err =>
      logger.warn('Redis cache error (falling through to DB)', { err })
    );
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
      } catch {
        /* closing */
      }
    }
  }

  /**
   * Publishes a message to a Redis channel.
   * Used for cross-instance event propagation (e.g., revocation notifications).
   */
  async publish(channel: string, message: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.publish(channel, message);
    } catch {
      // best-effort
    }
  }

  /**
   * Subscribes to a Redis channel and registers a handler for incoming messages.
   * Returns an unsubscribe function.
   * Automatically re-subscribes after reconnection.
   */
  async subscribe(channel: string, handler: (message: string) => void): Promise<() => void> {
    if (!this.client) return () => {};
    const subscriber = this.client.duplicate({
      retryStrategy: times => {
        if (times > 10) return null;
        return Math.min(times * 1000, 30000);
      },
    });
    let unsubscribed = false;
    const onMessage = (_ch: string, msg: string) => {
      if (!unsubscribed) handler(msg);
    };
    const doSubscribe = async () => {
      try {
        await subscriber.subscribe(channel);
      } catch {
        // retry will handle
      }
    };
    try {
      await doSubscribe();
      subscriber.on('message', onMessage);
      subscriber.on('reconnecting', () => {
        logger.info('Redis subscriber reconnecting, will re-subscribe to channel', { channel });
      });
      subscriber.on('connect', () => {
        if (!unsubscribed) {
          doSubscribe().catch(() => {});
        }
      });
      return () => {
        unsubscribed = true;
        subscriber.removeListener('message', onMessage);
        subscriber.unsubscribe(channel).catch(() => {});
        subscriber.quit().catch(() => {});
      };
    } catch {
      subscriber.quit().catch(() => {});
      return () => {};
    }
  }

  isAvailable(): boolean {
    return this.client !== null;
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.client) return null;
    try {
      const raw = await this.client.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlMs: number): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.setex(key, Math.ceil(ttlMs / 1000), JSON.stringify(value));
    } catch (err) {
      logger.warn('Redis cache set failed', { err });
    }
  }

  async del(key: string): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.del(key);
    } catch {
      // ignore
    }
  }

  async clear(): Promise<void> {
    if (!this.client) return;
    try {
      let cursor = '0';
      do {
        const result = await this.client.scan(cursor, 'MATCH', 'ca-cache:*', 'COUNT', '100');
        cursor = result[0];
        const keys = result[1];
        if (keys.length > 0) {
          await this.client.del(...keys);
        }
      } while (cursor !== '0');
    } catch {
      // best-effort
    }
  }

  makeKey(parts: string[]): string {
    return `ca-cache:${parts.join(':')}`;
  }
}
