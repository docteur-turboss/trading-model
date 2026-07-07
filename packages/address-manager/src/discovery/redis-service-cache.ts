import {
	type ServiceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import { RedisCacheOperations } from "./redis-cache-operations";
import { RedisCircuitStateStore } from "./redis-circuit-state-store";
import {
	RedisConnectionManager,
	type RedisConnectionOptions,
} from "./redis-connection-manager";
import type {
	CacheSetEntry,
	CircuitState,
	IServiceCache,
} from "./service-cache.interface";
import type Redis from "ioredis";

export interface RedisServiceCacheOptions extends RedisConnectionOptions {}

export interface RedisCacheConfig {
	redisUrl: string;
	prefix?: string;
	ttlMs?: number;
	cacheOptions?: RedisServiceCacheOptions;
}

export class RedisServiceCache implements IServiceCache {
	private readonly _connectionManager: RedisConnectionManager;
	private readonly _prefix: string;
	private readonly _ttlSec: number;
	private _cacheOps: RedisCacheOperations | null = null;
	private _circuitState: RedisCircuitStateStore | null = null;

	constructor(config: RedisCacheConfig) {
		const {
			redisUrl,
			prefix = "discovery:cache:",
			ttlMs = 5000,
			cacheOptions,
		} = config;
		this._prefix = prefix;
		this._ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
		this._connectionManager = new RedisConnectionManager(redisUrl, cacheOptions);
	}

	private async _ensureReady(): Promise<Redis> {
		const client = await this._connectionManager.getConnection();
		if (!this._cacheOps) {
			this._cacheOps = new RedisCacheOperations(client, this._prefix, this._ttlSec);
		}
		if (!this._circuitState) {
			this._circuitState = new RedisCircuitStateStore(client, this._prefix, this._ttlSec);
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

	async invalidate(serviceName: ServiceId, region?: string): Promise<void> {
		await this._ensureReady();
		return this._cacheOps!.invalidate(serviceName, region);
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
		return raw.map((e) => ({ ...e, serviceName: toServiceId(e.serviceName) }));
	}

	async setCircuitState(
		instanceId: string,
		state: CircuitState
	): Promise<void> {
		await this._ensureReady();
		return this._circuitState!.setCircuitState(instanceId, state);
	}

	async getCircuitState(instanceId: string): Promise<CircuitState | null> {
		await this._ensureReady();
		return this._circuitState!.getCircuitState(instanceId);
	}

	async deleteCircuitState(instanceId: string): Promise<void> {
		await this._ensureReady();
		return this._circuitState!.deleteCircuitState(instanceId);
	}

	stop(): void {
		this._connectionManager.close().catch(() => {});
	}
}
