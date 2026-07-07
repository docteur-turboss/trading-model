import { LruCache } from "@trading-model/common/utils/lru-cache";
import { ENV } from "../../config/env";
import { getStreamClient } from "../../config/redis";

export class WssDedup {
	private _local = new LruCache<true>({
		maxSize: 50000,
		ttlMs: 300_000,
	});

	async check(dedupId: string): Promise<boolean> {
		if (this._local.has(dedupId)) {
			return false;
		}
		this._local.set(dedupId, true);
		return this._checkRedis(dedupId);
	}

	private async _checkRedis(dedupId: string): Promise<boolean> {
		try {
			const redis = await getStreamClient();
			const key = `${ENV.REDIS_PREFIX}wss-dedup:${dedupId}`;
			return Boolean(await redis.set(key, "1", "EX", 300, "NX"));
		} catch {
			return true;
		}
	}

	clear(): void {
		this._local.clear();
	}
}
