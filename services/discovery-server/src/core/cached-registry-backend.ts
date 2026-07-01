import Redis from 'ioredis';

import { logger } from '@trading-model/common/config/logger';
import {
  RegistryBackend,
  ServiceInstance,
} from '@trading-model/common/contracts/service-registry.types';
import { normalizeError } from '@trading-model/common/utils/errors';
import { LruCache } from '@trading-model/common/utils/lru-cache';

interface CacheEntry {
  data: ServiceInstance[];
}

export class CachedRegistryBackend implements RegistryBackend {
  private readonly cache: LruCache<CacheEntry>;
  private readonly cacheTtlMs: number;
  private sweepHandle?: NodeJS.Timeout;
  private pubSub?: Redis;
  private readonly redisUrlForPubSub?: string;
  private redisHealthy = true;
  private consecutiveFailures = 0;
  private readonly redisFailureThreshold: number;
  private readonly redisHealthCheckIntervalMs: number;
  private healthCheckHandle?: NodeJS.Timeout;
  private restoreHandle?: NodeJS.Timeout;
  private readonly staleData: LruCache<ServiceInstance[]>;
  private healthCheckRunning = false;
  private fallbackActive = false;
  private originalBackend?: RegistryBackend;
  constructor(
    private backend: RegistryBackend,
    cacheTtlMs: number,
    redisUrlForPubSub?: string,
    maxEntries: number = 5000,
    redisFailureThreshold: number = 3,
    redisHealthCheckIntervalMs: number = 15_000
  ) {
    this.cacheTtlMs = cacheTtlMs;
    this.redisUrlForPubSub = redisUrlForPubSub;
    this.redisFailureThreshold = redisFailureThreshold;
    this.redisHealthCheckIntervalMs = redisHealthCheckIntervalMs;
    this.cache = new LruCache<CacheEntry>(maxEntries, cacheTtlMs);
    this.staleData = new LruCache<ServiceInstance[]>(maxEntries);
  }

  private async publishInvalidation(serviceName: string): Promise<void> {
    if (!this.pubSub || this.pubSub.status !== 'ready') return;
    try {
      await this.pubSub.publish('cache:invalidate', serviceName);
    } catch (err) {
      logger.warn('Failed to publish cache invalidation', {
        serviceName,
        error: normalizeError(err),
      });
    }
  }

  async registerInstance(instance: ServiceInstance): Promise<string> {
    const token = await this.backend.registerInstance(instance);
    await this.refreshCache(instance.serviceName);
    await this.publishInvalidation(instance.serviceName);
    return token;
  }

  private readonly heartbeatInvalidationThrottleMs = 5000;
  private lastHeartbeatInvalidation = new Map<string, number>();

  async updateHeartbeat(serviceName: string, instanceId: string): Promise<number | false> {
    const result = await this.backend.updateHeartbeat(serviceName, instanceId);
    if (result !== false) {
      await this.refreshCache(serviceName);
      // Throttled cross-node cache invalidation for heartbeats
      const now = Date.now();
      const last = this.lastHeartbeatInvalidation.get(serviceName) ?? 0;
      if (now - last >= this.heartbeatInvalidationThrottleMs) {
        this.lastHeartbeatInvalidation.set(serviceName, now);
        await this.publishInvalidation(serviceName);
      }
    }
    return result;
  }

  async updateToken(instanceId: string): Promise<string> {
    return this.backend.updateToken(instanceId);
  }

  async getInstanceCount(serviceName: string): Promise<number> {
    return this.backend.getInstanceCount(serviceName);
  }

  async getInstances(serviceName: string, offset?: number, limit?: number): Promise<ServiceInstance[]> {
    // When pagination is requested, bypass cache to get exact slice
    if (offset !== undefined || limit !== undefined) {
      return this.backend.getInstances(serviceName, offset, limit);
    }

    // Fallback active → backend is InMemory, healthy, and authoritative
    if (this.fallbackActive) {
      return this.backend.getInstances(serviceName);
    }

    const cached = this.cache.get(serviceName);
    if (cached) {
      return cached.data;
    }

    // When the backend is unhealthy, serve stale data if available
    if (!this.redisHealthy) {
      const stale = this.staleData.get(serviceName);
      if (stale) {
        logger.warn('Backend unhealthy — serving stale cached instance list for', { serviceName });
        return stale;
      }
      logger.warn('Backend unhealthy — no stale data available, returning empty list for', { serviceName });
      return [];
    }

    const instances = await this.backend.getInstances(serviceName);
    this.cache.set(serviceName, { data: instances });
    this.staleData.set(serviceName, instances);
    return instances;
  }

  async getInstance(serviceName: string, instanceId: string): Promise<ServiceInstance | undefined> {
    // Fallback active → backend is authoritative
    if (this.fallbackActive) {
      return this.backend.getInstance(serviceName, instanceId);
    }

    const cached = this.cache.get(serviceName);
    if (cached) {
      return cached.data.find((inst: ServiceInstance) => inst.instanceId === instanceId);
    }
    if (!this.redisHealthy) {
      const stale = this.staleData.get(serviceName);
      if (stale) {
        return stale.find((inst: ServiceInstance) => inst.instanceId === instanceId);
      }
    }
    return this.backend.getInstance(serviceName, instanceId);
  }

  async removeInstance(serviceName: string, instanceId: string): Promise<boolean> {
    const result = await this.backend.removeInstance(serviceName, instanceId);
    await this.refreshCache(serviceName);
    await this.publishInvalidation(serviceName);
    return result;
  }

  async getServiceVersion(serviceName: string): Promise<number> {
    return this.backend.getServiceVersion(serviceName);
  }

  async listServiceNames(): Promise<string[]> {
    return this.backend.listServiceNames();
  }

  async dump(): Promise<Record<string, ServiceInstance[]>> {
    return this.backend.dump();
  }

  async validInstanceToken(token: string, instanceId: string): Promise<boolean> {
    return this.backend.validInstanceToken(token, instanceId);
  }

  generateInstanceToken(instanceId: string): string {
    return this.backend.generateInstanceToken(instanceId);
  }

  verifyInstanceName(serviceName: string): boolean {
    return this.backend.verifyInstanceName(serviceName);
  }

  generateInstanceId(serviceName: string, address: string, port: number): string {
    return this.backend.generateInstanceId(serviceName, address, port);
  }

  /** Stale-while-revalidate: keep serving stale data while refreshing in background.
   *  Never delete before refresh to avoid a window where getInstances() bypasses cache.
   *  When Redis is unhealthy, skip backend call entirely — stale data is better than failure. */
  private async refreshCache(serviceName: string): Promise<void> {
    if (!this.redisHealthy && !this.fallbackActive) {
      logger.warn('Backend unhealthy — skipping cache refresh, serving stale data', { serviceName });
      return;
    }
    try {
      const instances = await this.backend.getInstances(serviceName);
      this.cache.set(serviceName, { data: instances });
      this.staleData.set(serviceName, instances);
    } catch {
      logger.warn('Cache refresh failed, serving stale data', { serviceName });
    }
  }

  async start(): Promise<void> {
    await this.backend.start();

    // Clear existing handles before creating new ones
    if (this.healthCheckHandle) {
      clearInterval(this.healthCheckHandle);
      this.healthCheckHandle = undefined;
    }
    if (this.restoreHandle) {
      clearInterval(this.restoreHandle);
      this.restoreHandle = undefined;
    }

    // Create PubSub connection AFTER backend start to avoid
    // missing invalidation messages between construction and start.
    if (this.redisUrlForPubSub && !this.pubSub) {
      try {
        this.pubSub = new Redis(this.redisUrlForPubSub, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });
        await this.pubSub.connect();

        this.pubSub.on('message', (channel: string, message: string) => {
          if (channel === 'cache:invalidate') {
            this.cache.delete(message);
            this.staleData.delete(message);
            logger.debug('Cache invalidated via Pub/Sub', { serviceName: message });
          }
        });

        await this.pubSub.subscribe('cache:invalidate');
        logger.info('Redis Pub/Sub connected for cache invalidation');
      } catch (err) {
        logger.error('Failed to connect Redis Pub/Sub for cache invalidation', {
          error: normalizeError(err),
        });
      }
    }

    // Redis health check loop for runtime circuit breaker
    this.healthCheckHandle = setInterval(async () => {
      if (this.healthCheckRunning) return;
      this.healthCheckRunning = true;
      try {
        if (this.redisUrlForPubSub || this.isRedisBackend()) {
          const healthy = await this.ping();
          if (healthy) {
            if (!this.redisHealthy) {
              this.redisHealthy = true;
              logger.info('Redis backend is healthy again — resumed normal operation');
            }
            this.consecutiveFailures = 0;
            } else {
            this.consecutiveFailures++;
            if (this.consecutiveFailures >= this.redisFailureThreshold) {
              this.redisHealthy = false;
              logger.error('Redis backend unhealthy — serving stale cache', {
                consecutiveFailures: this.consecutiveFailures,
              });
            }
          }
        }
      } catch {
        this.consecutiveFailures++;
        if (this.consecutiveFailures >= this.redisFailureThreshold) {
          this.redisHealthy = false;
          logger.error('Redis backend unhealthy — serving stale cache', {
            consecutiveFailures: this.consecutiveFailures,
          });
        }
      } finally {
        this.healthCheckRunning = false;
      }
    }, this.redisHealthCheckIntervalMs);

    // Periodic restore attempt when Redis is degraded
    if (this.redisUrlForPubSub || this.isRedisBackend()) {
      this.restoreHandle = setInterval(async () => {
        if (this.redisHealthy) return;
        try {
          const healthy = await this.ping();
          if (healthy) {
            // If we were in fallback mode with a saved original backend, restore it
            if (this.fallbackActive && this.originalBackend) {
              this.backend = this.originalBackend;
              this.originalBackend = undefined;
              this.fallbackActive = false;
              logger.info('Restored original Redis backend');
            }
            this.redisHealthy = true;
            this.consecutiveFailures = 0;
            this.cache.clear();
            logger.info('Redis backend is healthy again — resumed normal operation');
          }
        } catch {
          logger.warn('Redis restore attempt failed — staying on stale cache');
        }
      }, this.redisHealthCheckIntervalMs * 6);
    }
  }

  private isRedisBackend(): boolean {
    return typeof (this.backend as { ping?: unknown }).ping === 'function';
  }

  async ping(): Promise<boolean> {
    // When in fallback mode (Redis was replaced by InMemory), report degraded
    if (this.fallbackActive) return false;

    // PubSub health is independent of backend health.
    // A PubSub failure only degrades cross-node cache invalidation;
    // the backend may still serve fresh data.
    if (this.pubSub?.status === 'ready') {
      try {
        await this.pubSub.ping();
      } catch {
        logger.warn('PubSub ping failed — cache invalidation degraded');
      }
    }
    // Duck-typing: if the backend exposes a lightweight ping() (e.g. Redis PING), prefer it
    const backendWithPing = this.backend as { ping?: () => Promise<boolean> };
    if (typeof backendWithPing.ping === 'function') {
      try {
        return await backendWithPing.ping();
      } catch {
        return false;
      }
    }
    // No ping method: if Redis was configured but is gone, report degraded
    if (this.redisUrlForPubSub) {
      return false;
    }
    try {
      await this.backend.listServiceNames();
      return true;
    } catch {
      return false;
    }
  }

  markUnhealthy(): void {
    this.redisHealthy = false;
    this.consecutiveFailures = this.redisFailureThreshold;
  }

  setFallbackBackend(fallback: RegistryBackend): void {
    logger.warn('CachedRegistryBackend.setFallbackBackend — swapping to fallback backend');
    if (!this.fallbackActive) {
      this.originalBackend = this.backend;
    }
    this.fallbackActive = true;
    this.backend = fallback;
    this.cache.clear();
    this.staleData.clear();
  }

  stop(): void {
    if (this.healthCheckHandle) {
      clearInterval(this.healthCheckHandle);
      this.healthCheckHandle = undefined;
    }
    if (this.restoreHandle) {
      clearInterval(this.restoreHandle);
      this.restoreHandle = undefined;
    }
    this.cache.clear();
    this.staleData.clear();
    if (this.pubSub) {
      try { this.pubSub.unsubscribe('cache:invalidate'); } catch { /* ignore */ }
      try { this.pubSub.disconnect(); } catch { /* ignore */ }
      this.pubSub = undefined;
    }
    if (this.originalBackend) {
      try { this.originalBackend.stop(); } catch { /* ignore */ }
      this.originalBackend = undefined;
    }
    this.backend.stop();
  }

}
