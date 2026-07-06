import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";
import type { ServiceInstance } from "../client/type";
import { RedisCacheScanner } from "./redis-cache-scanner";
import type { CacheSetEntry } from "./service-cache.interface";

export class RedisCacheOperations {
	private readonly _scanner: RedisCacheScanner;

	constructor(
		private readonly _redis: Redis,
		private readonly _prefix: string,
		private readonly _ttlSec: number
	) {
		this._scanner = new RedisCacheScanner(this._redis, this._prefix);
	}

	async get(
		serviceName: string,
		region?: string
	): Promise<ServiceInstance | null> {
		try {
			const raw = await this._redis.get(this._cacheKey(serviceName, region));
			if (!raw) {
				return null;
			}
			const parsed = JSON.parse(raw);
			if (parsed?.instance && typeof parsed.version === "number") {
				return parsed.instance as ServiceInstance;
			}
			return parsed as ServiceInstance;
		} catch (err) {
			logger.warn("Redis cache get failed", {
				serviceName,
				error: normalizeError(err),
			});
			return null;
		}
	}

	async getVersion(serviceName: string, region?: string): Promise<number> {
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

	async set(entry: CacheSetEntry): Promise<void> {
		const { serviceName, instance, region, version } = entry;
		try {
			const data = { instance, version: version ?? 0 };
			await this._redis.setex(
				this._cacheKey(serviceName, region),
				this._ttlSec,
				JSON.stringify(data)
			);
		} catch (err) {
			logger.warn("Redis cache set failed", {
				serviceName,
				error: normalizeError(err),
			});
		}
	}

	async invalidate(serviceName: string, region?: string): Promise<void> {
		try {
			await this._redis.del(this._cacheKey(serviceName, region));
		} catch (err) {
			logger.warn("Redis cache invalidate failed", {
				serviceName,
				error: normalizeError(err),
			});
		}
	}

	async clear(): Promise<void> {
		return this._scanner.clear();
	}

	async entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	> {
		return this._scanner.entries();
	}

	private _cacheKey(serviceName: string, region?: string): string {
		return `${this._prefix}${region ? `${serviceName}::${region}` : serviceName}`;
	}
}
