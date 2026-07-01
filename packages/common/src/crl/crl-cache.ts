import { logger } from '../config/logger';

/**
 * Minimal Redis client interface for CRL cache cross-instance propagation.
 */
export interface CrlRedisClient {
  sadd(key: string, value: string): Promise<number>;
  sismember(key: string, value: string): Promise<number>;
  smembers(key: string): Promise<string[]>;
  publish(channel: string, message: string): Promise<number>;
  subscribe(channel: string, callback: (channel: string, message: string) => void): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  del(key: string): Promise<number>;
}

const CRL_REDIS_SET_KEY = 'crl:revoked';
const CRL_REDIS_CHANNEL = 'crl:updates';

/**
 * In-memory CRL cache that stores revoked certificate serial numbers.
 * Updated via the message-bus CrlSubscriber or by polling the CA.
 *
 * When a Redis client is provided, revocation events are propagated
 * across all instances via Redis pub/sub, and the cache is initialized
 * from Redis on construction.
 *
 * Synchronous methods (addRevoked, isRevoked, clear) operate on the
 * in-memory Set only. Async variants (addRevokedAsync, isRevokedAsync,
 * clearAsync) also synchronize with Redis.
 */
export class CrlCache {
  private revoked = new Set<string>();
  private redis: CrlRedisClient | null = null;
  private redisChannelCleanup: (() => void) | null = null;
  private initialized = false;

  constructor(redisClient?: CrlRedisClient) {
    if (redisClient) {
      this.redis = redisClient;
    }
  }

  /** Configure Redis client post-construction (for global singleton). */
  setRedisClient(client: CrlRedisClient): void {
    this.redis = client;
  }

  /** Force-initialize from Redis (blocking). Call during service bootstrap. */
  async initialize(): Promise<void> {
    if (this.redis) {
      await this.initFromRedis();
      await this.subscribeToRedis();
    } else if (process.env.NODE_ENV === 'production') {
      logger.error('CrlCache: Redis client required in production for cross-instance CRL sync');
      throw new Error('REDIS_URL must be configured for CRL cache in production');
    }
    this.initialized = true;
  }

  /**
   * Mark a certificate as revoked in the local cache.
   */
  addRevoked(serialNumber: string): void {
    this.revoked.add(serialNumber.toUpperCase());
  }

  /**
   * Mark a certificate as revoked in local cache + Redis (fire-and-forget).
   */
  async addRevokedAsync(serialNumber: string): Promise<void> {
    const sn = serialNumber.toUpperCase();
    this.revoked.add(sn);
    if (this.redis) {
      try {
        await this.redis.sadd(CRL_REDIS_SET_KEY, sn);
        await this.redis.publish(CRL_REDIS_CHANNEL, sn);
      } catch {
        // Redis failure is non-fatal for CRL cache
      }
    }
  }

  /**
   * Returns true if the given serial number has been revoked.
   * Checks local cache only (sync). Use isRevokedAsync for Redis-backed check.
   */
  isRevoked(serialNumber: string): boolean {
    return this.revoked.has(serialNumber.toUpperCase());
  }

  /**
   * Returns true if the given serial number has been revoked.
   * Checks local cache first, then Redis if configured.
   */
  async isRevokedAsync(serialNumber: string): Promise<boolean> {
    const sn = serialNumber.toUpperCase();
    if (this.revoked.has(sn)) return true;
    if (this.redis) {
      try {
        const inRedis = await this.redis.sismember(CRL_REDIS_SET_KEY, sn);
        if (inRedis) {
          this.revoked.add(sn);
          return true;
        }
      } catch {
        // Redis failure is non-fatal
      }
    }
    return false;
  }

  /**
   * Returns true if the cache contains no revoked serials.
   */
  get size(): number {
    return this.revoked.size;
  }

  /**
   * Removes all entries from the local cache.
   */
  clear(): void {
    this.revoked.clear();
  }

  /**
   * Removes all entries from local cache and Redis.
   */
  async clearAsync(): Promise<void> {
    this.revoked.clear();
    if (this.redis) {
      try {
        await this.redis.del(CRL_REDIS_SET_KEY);
      } catch {
        // Redis failure is non-fatal
      }
    }
  }

  /**
   * Cleanup Redis subscriptions.
   */
  destroy(): void {
    if (this.redisChannelCleanup) {
      this.redisChannelCleanup();
      this.redisChannelCleanup = null;
    }
    this.redis = null;
    this.revoked.clear();
  }

  private async initFromRedis(): Promise<void> {
    if (!this.redis) return;
    const members = await this.redis.smembers(CRL_REDIS_SET_KEY);
    for (const member of members) {
      this.revoked.add(member.toUpperCase());
    }
    logger.info('CrlCache initialized from Redis', { count: members.length });
  }

  private async subscribeToRedis(): Promise<void> {
    if (!this.redis) return;
    await this.redis.subscribe(CRL_REDIS_CHANNEL, (_channel: string, message: string) => {
      this.revoked.add(message.toUpperCase());
    });
    this.redisChannelCleanup = async () => {
      try {
        await this.redis?.unsubscribe(CRL_REDIS_CHANNEL);
      } catch {
        // best effort
      }
    };
    logger.info('CrlCache subscribed to Redis CRL updates');
  }
}

/**
 * Singleton shared across all services in the same process.
 * Initialize via globalCrlCache.initialize() during bootstrap.
 */
export const globalCrlCache = new CrlCache();
