import { CacheEntry } from './type';
import { ServiceInstance } from '../client/type';

/**
 * ServiceCache
 *
 * Responsibilities:
 * - In-memory storage of service instances
 * - TTL management for cached entries
 * - Explicit or automatic invalidation
 *
 * Constraints:
 * - No network logic
 * - No retry logic
 * - No external dependencies
 *
 * Intended to be used by the service discovery layer
 * to reduce repeated network calls for service instance information.
 */
/** Lightweight mutex to serialise concurrent access. */
class SimpleMutex {
  private promise: Promise<void> = Promise.resolve();

  async acquire(): Promise<() => void> {
    let release: () => void;
    const next = new Promise<void>(resolve => {
      release = resolve;
    });
    const prev = this.promise;
    this.promise = next;
    await prev;
    return release!;
  }
}

export class ServiceCache {
  private readonly ttlMs: number;
  private readonly cache: Map<string, CacheEntry>;
  private readonly mutex = new SimpleMutex();

  /**
   * Initializes a new ServiceCache instance.
   *
   * @param ttlMs - Time-to-live for each cache entry, in milliseconds.
   *
   * @example
   * ```ts
   * const cache = new ServiceCache(60_000); // 1 minute TTL
   * ```
   */
  constructor(ttlMs: number) {
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  /**
   * Retrieves a service instance from the cache.
   *
   * - Returns the cached instance if present and not expired.
   * - Returns `null` if the instance is missing or expired.
   *
   * @param serviceName - Name of the service to retrieve.
   * @returns A ServiceInstance or `null`.
   *
   * @example
   * ```ts
   * const instance = cache.get("user-service");
   * if (!instance) {
   *   // fetch from service registry
   * }
   * ```
   */
  async get(serviceName: string): Promise<ServiceInstance | null> {
    const release = await this.mutex.acquire();
    try {
      const entry = this.cache.get(serviceName);

      if (!entry) {
        return null;
      }

      if (this.isExpired(entry)) {
        this.cache.delete(serviceName);
        return null;
      }

      return entry.instance;
    } finally {
      release();
    }
  }

  /**
   * Stores or updates a service instance in the cache.
   *
   * - Sets the TTL for the cache entry.
   * - Replaces any existing entry for the same service.
   *
   * @param serviceName - Name of the service.
   * @param instance - Service instance to store.
   *
   * @example
   * ```ts
   * cache.set("user-service", instance);
   * ```
   */
  async set(serviceName: string, instance: ServiceInstance): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.cache.set(serviceName, {
        instance,
        expiresAt: Date.now() + this.ttlMs,
      });
    } finally {
      release();
    }
  }

  /**
   * Explicitly removes a service instance from the cache.
   *
   * - Useful for invalidating outdated or unhealthy entries.
   *
   * @param serviceName - Name of the service to remove.
   *
   * @example
   * ```ts
   * cache.invalidate("user-service");
   * ```
   */
  async invalidate(serviceName: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.cache.delete(serviceName);
    } finally {
      release();
    }
  }

  /**
   * Clears all entries from the cache.
   *
   * - Useful during global events, such as reconnection or full service reset.
   *
   * @example
   * ```ts
   * cache.clear();
   * ```
   */
  async clear(): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.cache.clear();
    } finally {
      release();
    }
  }

  /**
   * Determines if a cache entry has expired.
   *
   * @param entry - Cache entry to check.
   * @returns `true` if expired, `false` otherwise.
   *
   * @private
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() >= entry.expiresAt;
  }
}
