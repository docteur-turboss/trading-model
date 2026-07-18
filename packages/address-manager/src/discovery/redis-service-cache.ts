import {
	DurationMs,
	type InstanceId,
	type ServiceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ConnectionManager } from "@trading-model/common/persistence/connection-manager";
import { createRedisConnectionManager } from "@trading-model/common/persistence/redis-connection-manager";
import type { Cluster, Redis, RedisOptions } from "ioredis";
import type { ServiceInstance } from "../client/type";
import { RedisCacheOperations } from "./redis-cache-operations";
import { RedisCircuitStateStore } from "./redis-circuit-state-store";
import type { StoreOptions } from "./redis-store-config";
import type {
	CacheSetEntry,
	IServiceCache,
	PersistedCircuitState,
} from "./service-cache.interface";

export interface RedisServiceCacheOptions extends Partial<RedisOptions> {}

export interface RedisCacheConfig {
	redisUrl: string;
	prefix?: string;
	ttlMs?: DurationMs;
	cacheOptions?: RedisServiceCacheOptions;
}

export class RedisServiceCache implements IServiceCache {
	private readonly _connectionManager: ConnectionManager<Redis | Cluster>;
	private readonly _storeOptions: StoreOptions;
	private _cacheOps: RedisCacheOperations | null = null;
	private _circuitState: RedisCircuitStateStore | null = null;

	constructor(config: RedisCacheConfig) {
		const {
			redisUrl,
			prefix = "discovery:cache:",
			ttlMs = DurationMs.of(5000),
			cacheOptions,
		} = config;
		this._storeOptions = {
			prefix,
			ttlSec: Math.max(1, Math.ceil(ttlMs / 1000)),
		};
		this._connectionManager = createRedisConnectionManager(
			redisUrl,
			cacheOptions
		);
	}

	private async _ensureReady(): Promise<Redis> {
		const client = (await this._connectionManager.getConnection()) as Redis;
		if (!this._cacheOps) {
			this._cacheOps = new RedisCacheOperations({
				redis: client,
				...this._storeOptions,
			});
		}
		if (!this._circuitState) {
			this._circuitState = new RedisCircuitStateStore({
				redis: client,
				...this._storeOptions,
			});
		}
		return client;
	}

	async get(
		serviceName: ServiceId,
		region?: string
	): Promise<ServiceInstance | null> {
		await this._ensureReady();
		return this._cacheOps!.get(serviceName, region);
	}

	async getVersion(serviceName: ServiceId, region?: string): Promise<number> {
		await this._ensureReady();
		return this._cacheOps!.getVersion(serviceName, region);
	}

	async set(entry: CacheSetEntry): Promise<void> {
		await this._ensureReady();
		return this._cacheOps!.set(entry);
	}

	async delete(serviceName: ServiceId, region?: string): Promise<void> {
		await this._ensureReady();
		return this._cacheOps!.delete(serviceName, region);
	}

	async clear(): Promise<void> {
		await this._ensureReady();
		return this._cacheOps!.clear();
	}

	async entries(): Promise<
		Array<{
			serviceName: ServiceId;
			instance: ServiceInstance;
			region?: string;
		}>
	> {
		await this._ensureReady();
		const raw = await this._cacheOps!.entries();
		return raw.map((entry) => ({
			...entry,
			serviceName: toServiceId(entry.serviceName),
		}));
	}

	async setCircuitState(
		instanceId: InstanceId,
		state: PersistedCircuitState
	): Promise<void> {
		await this._ensureReady();
		return this._circuitState!.setCircuitState(instanceId, state);
	}

	async getCircuitState(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null> {
		await this._ensureReady();
		return this._circuitState!.getCircuitState(instanceId);
	}

	async deleteCircuitState(instanceId: InstanceId): Promise<void> {
		await this._ensureReady();
		return this._circuitState!.deleteCircuitState(instanceId);
	}

	close(): void {
		this._connectionManager.close().catch(() => {});
	}
}
