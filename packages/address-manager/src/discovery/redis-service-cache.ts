import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis, { type RedisOptions } from "ioredis";
import type { ServiceInstance } from "../client/type";
import type { CircuitState, IServiceCache } from "./service-cache.interface";
import { RedisCacheOperations } from "./redis-cache-operations";
import { RedisCircuitStateStore } from "./redis-circuit-state-store";

export interface RedisServiceCacheOptions {
	password?: string;
	tls?: Record<string, unknown>;
	sentinels?: Array<HostPort>;
	enableTLSForSentinelMode?: boolean;
}

export interface RedisCacheConfig {
	redisUrl: string;
	prefix?: string;
	ttlMs?: number;
	cacheOptions?: RedisServiceCacheOptions;
}

export class RedisServiceCache implements IServiceCache {
	private readonly _redis: Redis;
	private readonly _prefix: string;
	private readonly _ttlSec: number;
	private readonly _cacheOps: RedisCacheOperations;
	private readonly _circuitState: RedisCircuitStateStore;

	constructor(config: RedisCacheConfig) {
		const { redisUrl, prefix = "discovery:cache:", ttlMs = 5000, cacheOptions } = config;
		this._prefix = prefix;
		this._ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
		this._redis = new Redis(redisUrl, this._buildRedisOptions(cacheOptions));
		this._connectRedis();
		this._cacheOps = new RedisCacheOperations(this._redis, this._prefix, this._ttlSec);
		this._circuitState = new RedisCircuitStateStore(this._redis, this._prefix, this._ttlSec);
	}

	private _buildRedisOptions(cacheOptions?: RedisServiceCacheOptions): RedisOptions {
		const baseOptions: RedisOptions = {
			lazyConnect: true,
			retryStrategy: (times: number) => {
				if (times > 20) {
					return null;
				}
				return Math.min(times * 200, 5000);
			},
			maxRetriesPerRequest: 3,
		};
		return {
			...baseOptions,
			...(cacheOptions?.password ? { password: cacheOptions.password } : {}),
			...(cacheOptions?.tls ? { tls: cacheOptions.tls } : {}),
			...(cacheOptions?.sentinels
				? { sentinels: cacheOptions.sentinels, name: "mymaster" }
				: {}),
		};
	}

	private _connectRedis(): void {
		this._redis.connect().catch((err) => {
			logger.error("Failed to connect Redis service cache", {
				error: normalizeError(err),
			});
		});
	}

	async get(
		serviceName: string,
		region?: string,
	): Promise<ServiceInstance | null> {
		return this._cacheOps.get(serviceName, region);
	}

	async getVersion(serviceName: string, region?: string): Promise<number> {
		return this._cacheOps.getVersion(serviceName, region);
	}

	async set(
		serviceName: string,
		instance: ServiceInstance,
		region?: string,
		version?: number,
	): Promise<void> {
		return this._cacheOps.set(serviceName, instance, region, version);
	}

	async invalidate(serviceName: string, region?: string): Promise<void> {
		return this._cacheOps.invalidate(serviceName, region);
	}

	async clear(): Promise<void> {
		return this._cacheOps.clear();
	}

	async entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	> {
		return this._cacheOps.entries();
	}

	async setCircuitState(instanceId: string, state: CircuitState): Promise<void> {
		return this._circuitState.setCircuitState(instanceId, state);
	}

	async getCircuitState(instanceId: string): Promise<CircuitState | null> {
		return this._circuitState.getCircuitState(instanceId);
	}

	async deleteCircuitState(instanceId: string): Promise<void> {
		return this._circuitState.deleteCircuitState(instanceId);
	}

	stop(): void {
		try {
			this._redis.disconnect();
		} catch {
			/* ignore */
		}
	}
}
