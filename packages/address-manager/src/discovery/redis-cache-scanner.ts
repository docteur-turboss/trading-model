import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";
import type { ServiceInstance } from "../client/type";

export class RedisCacheScanner {
	constructor(
		private readonly _redis: Redis,
		private readonly _prefix: string
	) {}

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
					200
				);
				cursor = nextCursor;
				for (const key of batch) {
					const raw = await this._redis.get(key);
					if (!raw) {
						continue;
					}
					const entry = this._parseEntry(key, raw);
					if (entry) {
						results.push(entry);
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

	private _parseEntry(
		key: string,
		raw: string
	): { serviceName: string; instance: ServiceInstance; region?: string } | null {
		try {
			const parsed = JSON.parse(raw);
			const instance = parsed?.instance ?? parsed;
			if (!instance?.serviceName) {
				return null;
			}
			const suffix = key.slice(this._prefix.length);
			const [serviceName, region] = suffix.includes("::")
				? [suffix.split("::")[0], suffix.split("::")[1]]
				: [suffix, undefined];
			return {
				serviceName,
				instance: instance as ServiceInstance,
				region,
			};
		} catch {
			logger.debug("Skipped corrupt cache entry");
			return null;
		}
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
				200
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
