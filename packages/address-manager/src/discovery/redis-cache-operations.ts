import { logger } from "@trading-model/common/config/logger";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../client/type";
import { RedisCacheScanner } from "./redis-cache-scanner";
import type { RedisStoreConfig } from "./redis-store-config";
import type { CacheSetEntry } from "./service-cache.interface";

export class RedisCacheOperations {
	private readonly _redis: import("ioredis").Redis;
	private readonly _prefix: string;
	private readonly _ttlSec: number;
	private readonly _scanner: RedisCacheScanner;

	constructor(config: RedisStoreConfig) {
		this._redis = config.redis;
		this._prefix = config.prefix;
		this._ttlSec = config.ttlSec;
		this._scanner = new RedisCacheScanner(this._redis, this._prefix);
	}

	async get(
		serviceName: ServiceId,
		region?: string
	): Promise<ServiceInstance | null> {
		try {
			const raw = await this._redis.get(this._cacheKey(serviceName, region));
			if (!raw) {
				return null;
			}
			return this._parseCacheEntry(raw);
		} catch (err) {
			logger.warn("Redis cache get failed", {
				serviceName,
				error: normalizeError(err),
			});
			return null;
		}
	}

	async getVersion(serviceName: ServiceId, region?: string): Promise<number> {
		try {
			const raw = await this._redis.get(this._cacheKey(serviceName, region));
			if (!raw) {
				return 0;
			}
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed.version === "number") {
				return parsed.version;
			}
			return 0;
		} catch {
			return 0;
		}
	}

	async invalidate(serviceName: ServiceId, region?: string): Promise<void> {
		try {
			await this._redis.del(this._cacheKey(serviceName, region));
		} catch (err) {
			logger.warn("Redis cache invalidate failed", {
				serviceName,
				error: normalizeError(err),
			});
		}
	}

	entries(): Promise<
		Array<{
			serviceName: ServiceId;
			instance: ServiceInstance;
			region?: string;
		}>
	> {
		return this._scanner.entries();
	}

	private _parseCacheEntry(raw: string): ServiceInstance | null {
		try {
			return JSON.parse(raw) as ServiceInstance;
		} catch {
			return null;
		}
	}

	async set(entry: CacheSetEntry): Promise<void> {
		try {
			const key = this._cacheKey(entry.serviceName, entry.region);
			await this._redis.setex(
				key,
				this._ttlSec,
				JSON.stringify(entry.instance)
			);
		} catch (err) {
			logger.warn("Redis cache set failed", {
				serviceName: entry.serviceName,
				error: normalizeError(err),
			});
		}
	}

	async clear(): Promise<void> {
		await this._scanner.clear();
	}

	private _cacheKey(serviceName: ServiceId, region?: string): string {
		return `${this._prefix}${region ? `${serviceName}::${region}` : serviceName}`;
	}
}
