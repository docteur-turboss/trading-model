import { CircuitState } from './service-cache.interface';
import { CacheEntry } from './type';
import { ServiceInstance } from '../client/type';

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
  private readonly maxTtlMs: number;
  private readonly cacheDir?: string;
  private readonly maxEntries: number;
  private readonly cache: Map<string, CacheEntry>;
  private readonly mutex = new SimpleMutex();

  constructor(
    ttlMs: number,
    maxTtlMs?: number,
    cacheDir?: string,
    _cacheDir2?: unknown,
    maxEntries?: number
  ) {
    this.ttlMs = ttlMs;
    this.maxTtlMs = maxTtlMs ?? ttlMs * 2;
    this.cacheDir = cacheDir;
    this.maxEntries = maxEntries ?? 1000;
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

  async entries(): Promise<Array<{ serviceName: string; instance: ServiceInstance; region?: string }>> {
    const release = await this.mutex.acquire();
    try {
      const result: Array<{ serviceName: string; instance: ServiceInstance }> = [];
      for (const [serviceName, entry] of this.cache) {
        if (!this.isExpired(entry)) {
          result.push({ serviceName, instance: entry.instance });
        }
      }
      return result;
    } finally {
      release();
    }
  }

  async getVersion(_serviceName: string, _region?: string): Promise<number> {
    return 0;
  }

  stop(): void {
    this.cache.clear();
  }

  private readonly circuitStates = new Map<string, CircuitState>();

  async setCircuitState(instanceId: string, state: CircuitState): Promise<void> {
    this.circuitStates.set(instanceId, state);
  }

  async getCircuitState(instanceId: string): Promise<CircuitState | null> {
    return this.circuitStates.get(instanceId) ?? null;
  }

  async deleteCircuitState(instanceId: string): Promise<void> {
    this.circuitStates.delete(instanceId);
  }
}
