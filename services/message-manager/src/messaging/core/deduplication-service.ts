import { DurationMs } from "@trading-model/common/domain/primitives";
import { REDIS_SET } from "@trading-model/common/persistence/redis-constants";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import { logger } from "../../config/logger";
import { getStreamClient } from "../../config/redis";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";
import type { IDedupOps } from "./dedup-ops-interface";
import type { DedupConfig } from "./messaging-types";

export class DeduplicationService implements IDedupOps {
	private _localDedupCache = new LruCache<boolean>({
		maxSize: 10000,
		ttlMs: DurationMs.of(300_000),
	});
	private _degradedDedupCache = new LruCache<boolean>({
		maxSize: 50000,
		ttlMs: DurationMs.of(3600_000),
	});

	constructor(private readonly _keys: RedisKeyBuilder) {}

	async tryDeduplicate(params: DedupConfig): Promise<boolean> {
		if (this._localDedupCache.has(params.deduplicationId)) {
			return false;
		}

		try {
			return await this._tryRedisDedup(params.deduplicationId, params.ttlS);
		} catch (err) {
			return this._useDegradedCache(params.deduplicationId, err as Error);
		}
	}

	private async _tryRedisDedup(
		deduplicationId: string,
		ttlS: number
	): Promise<boolean> {
		const redis = await getStreamClient();
		const key = this._keys.key("dedup", deduplicationId);
		const result = await redis.set(
			key,
			Date.now().toString(),
			REDIS_SET.EX,
			ttlS,
			REDIS_SET.NX
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
