import { LruCache } from "@trading-model/common/utils/lru-cache";

import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";

export class DeduplicationService {
	private _localDedupCache = new LruCache<boolean>({
		maxSize: 10000,
		ttlMs: 300_000,
	});
	private _degradedDedupCache = new LruCache<boolean>({
		maxSize: 50000,
		ttlMs: 3600_000,
	});

	constructor(private readonly _prefix: string) {}

	async tryDeduplicate(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		if (this._localDedupCache.has(deduplicationId)) {
			return false;
		}

		try {
			return await this._tryRedisDedup(deduplicationId, ttlS);
		} catch (err) {
			return this._useDegradedCache(deduplicationId, err as Error);
		}
	}

	private async _tryRedisDedup(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		const redis = await getStreamClient();
		const key = `${this._prefix}dedup:${deduplicationId}`;
		const result = await redis.set(
			key,
			Date.now().toString(),
			"EX",
			ttlS,
			"NX"
		);
		if (result !== null) {
			this._localDedupCache.set(deduplicationId, true);
			return true;
		}
		return false;
	}

	clear(): void {
		this._localDedupCache.clear();
		this._degradedDedupCache.clear();
	}

	private _useDegradedCache(deduplicationId: string, err: Error): boolean {
		if (this._degradedDedupCache.has(deduplicationId)) {
			return false;
		}
		this._degradedDedupCache.set(deduplicationId, true);
		logger.warn("Dedup Redis unavailable — using degraded local cache", {
			deduplicationId,
			error: err.message,
		});
		return true;
	}
}
