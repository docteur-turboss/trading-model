import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";
import type { ServiceInstance } from "../client/type";

export class RedisCacheOperations {
	constructor(
		private readonly _redis: Redis,
		private readonly _prefix: string,
		private readonly _ttlSec: number,
	) {}

	async get(
		serviceName: string,
		region?: string,
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

	async set(
		serviceName: string,
		instance: ServiceInstance,
		region?: string,
		version?: number,
	): Promise<void> {
		try {
			const entry = { instance, version: version ?? 0 };
			await this._redis.setex(
				this._cacheKey(serviceName, region),
				this._ttlSec,
				JSON.stringify(entry),
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
		try {
			const keys = await this._scanAllKeys();
			await this._deleteKeys(keys);
		} catch (err) {
			logger.warn("Redis cache clear failed", { error: normalizeError(err) });
		}
	}

	async entries(): Promise<
		Array<{ serviceName: string; instance: ServiceInstance; region?: string }>
	> {
		try {
			const results: Array<{
				serviceName: string;
				instance: ServiceInstance;
				region?: string;
			}> = [];
			let cursor = "0";
			do {
				const [nextCursor, batch] = await this._redis.scan(
					cursor,
					"MATCH",
					`${this._prefix}*`,
					"COUNT",
					200,
				);
				cursor = nextCursor;
				for (const key of batch) {
					const raw = await this._redis.get(key);
					if (!raw) {
						continue;
					}
					try {
						const parsed = JSON.parse(raw);
						const instance = parsed?.instance ?? parsed;
						if (!instance?.serviceName) {
							continue;
						}
						const suffix = key.slice(this._prefix.length);
						const [serviceName, region] = suffix.includes("::")
							? [suffix.split("::")[0], suffix.split("::")[1]]
							: [suffix, undefined];
						results.push({
							serviceName,
							instance: instance as ServiceInstance,
							region,
						});
					} catch {
						/* skip corrupt entry */
					}
				}
			} while (cursor !== "0");
			return results;
		} catch (err) {
			logger.warn("Redis cache entries() failed", {
				error: normalizeError(err),
			});
			return [];
		}
	}

	private _cacheKey(serviceName: string, region?: string): string {
		return `${this._prefix}${region ? `${serviceName}::${region}` : serviceName}`;
	}

	private async _scanAllKeys(): Promise<string[]> {
		let cursor = "0";
		const keysToDelete: string[] = [];
		do {
			const [nextCursor, batch] = await this._redis.scan(
				cursor,
				"MATCH",
				`${this._prefix}*`,
				"COUNT",
				200,
			);
			cursor = nextCursor;
			keysToDelete.push(...batch);
		} while (cursor !== "0");
		return keysToDelete;
	}

	private async _deleteKeys(keys: string[]): Promise<void> {
		if (keys.length === 0) {
			return;
		}
		const pipeline = this._redis.pipeline();
		for (const key of keys) {
			pipeline.del(key);
		}
		await pipeline.exec();
	}
}
