import { createHmac, randomBytes, timingSafeEqual } from 'crypto';

import Redis, { Cluster, RedisOptions } from 'ioredis';

import { logger } from '@trading-model/common/config/logger';
import { ServiceInstanceName } from '@trading-model/common/config/services.types';
import {
  RegistryBackend,
  ServiceInstance,
} from '@trading-model/common/contracts/service-registry.types';
import { generateRandomStr } from '@trading-model/common/crypto/random';
import { normalizeError } from '@trading-model/common/utils/errors';

// ─── Connection Configuration Types ─────────────────────────────────────────

export interface RedisSentinelConfig {
  /** Sentinel nodes to discover the current master. */
  sentinels: Array<{ host: string; port: number }>;
  /** Logical name of the master set (default: mymaster). */
  name: string;
  /** Optional password for Redis (when requirepass is set). */
  password?: string;
}

export interface RedisClusterNodesConfig {
  /** Cluster seed nodes. The Cluster client discovers the full topology. */
  nodes: Array<{ host: string; port: number }>;
  /** Optional password for Cluster nodes. */
  password?: string;
}

export type RedisConnectionConfig =
  | { mode: 'single'; url: string }
  | { mode: 'sentinel'; config: RedisSentinelConfig }
  | { mode: 'cluster'; config: RedisClusterNodesConfig };

// ─── Backend ────────────────────────────────────────────────────────────────

/**
 * RedisRegistryBackend
 *
 * Distributed, persistent backend for service instance storage.
 *
 * Designed for multi-node / multi-region deployments where
 * multiple discovery-server instances must share the same
 * registry state.
 *
 * ## High-Availability modes
 *
 * | Mode       | Env vars                              | Behaviour                |
 * |------------|---------------------------------------|--------------------------|
 * | Single     | `REDIS_URL`                           | Legacy, single node      |
 * | Sentinel   | `REDIS_SENTINELS` + `REDIS_SENTINEL_MASTER_NAME` | Auto-failover |
 * | Cluster    | `REDIS_CLUSTER_NODES`                 | Sharding + replication   |
 *
 * Storage layout in Redis:
 *   {prefix}service:{serviceName}:instances  →  Set of instanceIds
 *   {prefix}instance:{instanceId}:metadata   →  JSON-serialised ServiceInstance
 *   {prefix}instance:{instanceId}:token      →  String (HMAC token)
 *
 * Token generation, validation, and instance name verification
 * are handled locally (same logic as InMemoryRegistryBackend) —
 * only storage is distributed.
 */
export class RedisRegistryBackend implements RegistryBackend {
  private readonly redis: Redis | Cluster;
  private readonly prefix: string;
  private readonly signingSecret: string;
  private readonly cleanupIntervalMs: number;
  private cleanupHandle?: NodeJS.Timeout;

  constructor(
    configOrUrl: string | RedisConnectionConfig,
    prefix = 'discovery:',
    signingSecret?: string,
    cleanupIntervalMs = 10_000
  ) {
    this.signingSecret = signingSecret ?? randomBytes(32).toString('hex');
    this.cleanupIntervalMs = cleanupIntervalMs;

    // In Cluster mode, wrap the prefix with hash-tag braces so all multi()-related
    // keys hash to the same slot and avoid CROSSSLOT errors.
    const isCluster = typeof configOrUrl !== 'string' && configOrUrl.mode === 'cluster';
    this.prefix = isCluster ? `{${prefix.replace(/[{}]/g, '').replace(/:$/, '')}}:` : prefix;

    const baseOptions: RedisOptions = {
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 200, 5000);
        return delay;
      },
      maxRetriesPerRequest: 5,
      lazyConnect: true,
    };

    if (typeof configOrUrl === 'string') {
      // Legacy: single Redis URL
      this.redis = new Redis(configOrUrl, baseOptions);
    } else {
      switch (configOrUrl.mode) {
        case 'single':
          this.redis = new Redis(configOrUrl.url, baseOptions);
          break;

        case 'sentinel': {
          const { sentinels, name, password } = configOrUrl.config;
          this.redis = new Redis({
            ...baseOptions,
            sentinels,
            name,
            password,
            // SentinelConnector requires an explicit role; 'master' by default
          });
          break;
        }

        case 'cluster': {
          const { nodes, password } = configOrUrl.config;
          // Cluster doesn't support multi-key operations across slots.
          // Register/remove operations use multi() on keys that may span
          // different slots — use hash tags ({prefix}) in key names when
          // running in Cluster mode to keep them on the same slot.
          this.redis = new Cluster(nodes, {
            redisOptions: {
              ...baseOptions,
              password,
            },
            clusterRetryStrategy: (times: number) => {
              const delay = Math.min(times * 200, 5000);
              return delay;
            },
          });
          break;
        }

        default:
          throw new Error(
            `Unknown Redis connection mode: ${(configOrUrl as RedisConnectionConfig).mode}`
          );
      }
    }

    this.redis.on('error', (err: Error) => {
      logger.error('Redis connection error', { error: normalizeError(err) });
    });
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  async registerInstance(instance: ServiceInstance): Promise<string> {
    const { serviceName, instanceId } = instance;
    const now = Date.now();

    // F23: Use SET NX for the token to prevent race conditions when two
    // servers generate a token for the same instanceId — first writer wins.
    const tokenKey = `${this.prefix}instance:${instanceId}:token`;
    const token = this.generateInstanceToken(instanceId);
    const tokenSet = await this.redis.set(tokenKey, token, 'NX');
    const finalToken = tokenSet === 'OK' ? token : await this.redis.get(tokenKey);

    const multi = this.redis.multi();

    // Add instance to service set
    multi.sadd(`${this.prefix}service:${serviceName}:instances`, instanceId);

    // Store instance metadata (always set registeredAt and lastHeartbeat server-side)
    const storedInstance: ServiceInstance = {
      ...instance,
      registeredAt: instance.registeredAt ?? now,
      lastHeartbeat: now,
    };

    // Check if instance already exists to preserve original registration time
    const existingJson = await this.redis.get(`${this.prefix}instance:${instanceId}:metadata`);
    if (existingJson) {
      try {
        const existing: ServiceInstance = JSON.parse(existingJson);
        storedInstance.registeredAt = existing.registeredAt;
        storedInstance.lastHeartbeat = Math.max(
          storedInstance.lastHeartbeat,
          existing.lastHeartbeat
        );
      } catch (err) {
        logger.warn('Failed to parse existing instance metadata', {
          instanceId,
          err: normalizeError(err),
        });
      }
    }

    multi.set(`${this.prefix}instance:${instanceId}:metadata`, JSON.stringify(storedInstance));

    await multi.exec();

    return finalToken ?? token;
  }

  // ─── Heartbeat ──────────────────────────────────────────────────────────────

  async updateHeartbeat(serviceName: string, instanceId: string): Promise<number | false> {
    const exists = await this.redis.sismember(
      `${this.prefix}service:${serviceName}:instances`,
      instanceId
    );

    if (!exists) return false;

    const json = await this.redis.get(`${this.prefix}instance:${instanceId}:metadata`);
    if (!json) return false;

    try {
      const instance: ServiceInstance = JSON.parse(json);
      // F30-32: Ensure monotonic heartbeat — clock skew must never
      // push lastHeartbeat backwards or expire healthy instances.
      instance.lastHeartbeat = Math.max(instance.lastHeartbeat, Date.now());

      const multi = this.redis.multi();
      multi.set(`${this.prefix}instance:${instanceId}:metadata`, JSON.stringify(instance));
      // Tag which server last updated this instance for skew attribution
      multi.set(`${this.prefix}instance:${instanceId}:updatedBy`, `${serviceName}:${instanceId}`);
      await multi.exec();

      return instance.ttl;
    } catch (err) {
      logger.warn('Failed to update heartbeat in Redis', {
        serviceName,
        instanceId,
        err: normalizeError(err),
      });
      return false;
    }
  }

  // ─── Token ──────────────────────────────────────────────────────────────────

  async updateToken(instanceId: string): Promise<string> {
    const newToken = this.generateInstanceToken(instanceId);
    await this.redis.set(`${this.prefix}instance:${instanceId}:token`, newToken);
    return newToken;
  }

  // ─── Query ──────────────────────────────────────────────────────────────────

  async getInstances(serviceName: string): Promise<ServiceInstance[]> {
    const instanceIds = await this.redis.smembers(`${this.prefix}service:${serviceName}:instances`);

    if (instanceIds.length === 0) return [];

    const keys = instanceIds.map(id => `${this.prefix}instance:${id}:metadata`);
    const results = await this.redis.mget(keys);

    const instances: ServiceInstance[] = [];
    for (const json of results) {
      if (json) {
        try {
          instances.push(JSON.parse(json));
        } catch (err) {
          logger.warn('Skipping corrupt instance entry in Redis', { err: normalizeError(err) });
        }
      }
    }

    return instances;
  }

  async getInstance(serviceName: string, instanceId: string): Promise<ServiceInstance | undefined> {
    const json = await this.redis.get(`${this.prefix}instance:${instanceId}:metadata`);
    if (!json) return undefined;

    try {
      return JSON.parse(json);
    } catch (err) {
      logger.warn('Failed to parse instance metadata from Redis', {
        instanceId,
        err: normalizeError(err),
      });
      return undefined;
    }
  }

  // ─── Removal ────────────────────────────────────────────────────────────────

  async removeInstance(serviceName: string, instanceId: string): Promise<boolean> {
    const multi = this.redis.multi();
    multi.srem(`${this.prefix}service:${serviceName}:instances`, instanceId);
    multi.del(`${this.prefix}instance:${instanceId}:metadata`);
    multi.del(`${this.prefix}instance:${instanceId}:token`);
    multi.del(`${this.prefix}instance:${instanceId}:updatedBy`);

    const results = await multi.exec();
    if (!results) return false;

    // results[0] is the srem result — [error, count]
    const sremResult = results[0];
    return sremResult?.[1] === 1;
  }

  // ─── Introspection ──────────────────────────────────────────────────────────

  async listServiceNames(): Promise<string[]> {
    const keys = await this.redis.keys(`${this.prefix}service:*:instances`);
    return keys
      .map(k => {
        const match = k.match(new RegExp(`^${this.prefix}service:(.+):instances$`));
        return match ? match[1] : null;
      })
      .filter((name): name is string => name !== null);
  }

  async dump(): Promise<Record<string, ServiceInstance[]>> {
    const serviceNames = await this.listServiceNames();
    const snapshot: Record<string, ServiceInstance[]> = {};

    for (const name of serviceNames) {
      snapshot[name] = await this.getInstances(name);
    }

    return snapshot;
  }

  // ─── Token / ID validation ─────────────────────────────────────────────────

  generateInstanceToken(instanceId: string): string {
    const encodedId = Buffer.from(instanceId, 'utf8').toString('base64url');
    const timestamp = Buffer.from(`${Date.now()}`, 'utf8').toString('base64url');
    const nonce = generateRandomStr();

    const hmac = createHmac('sha256', this.signingSecret)
      .update(`${encodedId}.${timestamp}.${nonce}`)
      .digest('base64url');

    return `${encodedId}.${timestamp}.${nonce}.${hmac}`;
  }

  async validInstanceToken(token: string, instanceId: string): Promise<boolean> {
    const parts = token.split('.');
    if (parts.length !== 4) return false;

    const [encodedId, timestamp, nonce, signature] = parts;

    const decodedId = Buffer.from(encodedId, 'base64url').toString('utf8');
    if (decodedId !== instanceId) return false;

    const expectedHmac = createHmac('sha256', this.signingSecret)
      .update(`${encodedId}.${timestamp}.${nonce}`)
      .digest('base64url');

    try {
      if (!timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(signature))) {
        return false;
      }
    } catch (err) {
      logger.warn('Token validation failed', { instanceId, err: normalizeError(err) });
      return false;
    }

    const storedToken = await this.redis.get(`${this.prefix}instance:${instanceId}:token`);
    return storedToken === token;
  }

  verifyInstanceName(serviceName: string): boolean {
    return (Object.values(ServiceInstanceName) as readonly string[]).includes(serviceName);
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  start(): void {
    this.redis.connect().catch(err => {
      logger.error('Failed to connect to Redis', { error: normalizeError(err) });
    });

    // F38: Add a random initial delay (0 … cleanupIntervalMs) so that
    // multiple discovery-server instances don't run cleanup simultaneously.
    // Clock skew is already handled by a 2000ms tolerance in
    // cleanupExpiredInstances().
    const initialDelay = Math.floor(Math.random() * this.cleanupIntervalMs);
    setTimeout(() => {
      this.cleanupHandle = setInterval(() => {
        this.cleanupExpiredInstances().catch(err => {
          logger.error('Redis cleanup error', { error: normalizeError(err) });
        });
      }, this.cleanupIntervalMs);
    }, initialDelay);

    logger.info('RedisRegistryBackend started', {
      cleanupIntervalMs: this.cleanupIntervalMs,
      initialDelay,
    });
  }

  stop(): void {
    if (this.cleanupHandle) {
      clearInterval(this.cleanupHandle);
      this.cleanupHandle = undefined;
    }
    this.redis.disconnect();
    logger.info('RedisRegistryBackend stopped');
  }

  private async cleanupExpiredInstances(): Promise<void> {
    const CLOCK_SKEW_TOLERANCE_MS = 2000;
    const now = Date.now();
    const serviceNames = await this.listServiceNames();

    for (const serviceName of serviceNames) {
      const instances = await this.getInstances(serviceName);

      for (const instance of instances) {
        if (now - instance.lastHeartbeat > instance.ttl + CLOCK_SKEW_TOLERANCE_MS) {
          logger.warn('Expired instance removed', {
            serviceName,
            instanceId: instance.instanceId,
            heartbeatAge: now - instance.lastHeartbeat,
            ttl: instance.ttl,
          });
          await this.removeInstance(serviceName, instance.instanceId);
        }
      }
    }
  }
}
