import { REDIS_SET } from "@trading-model/common/persistence/redis-constants";
import type Redis from "ioredis";
import { logger } from "../../config/logger";
import type { RedisKeyBuilder } from "../../infrastructure/redis/redis-key-builder";

export class ClaimLockManager {
	constructor(private readonly _keys: RedisKeyBuilder) {}

	private _lockKey(): string {
		return this._keys.key("claim-lock");
	}

	async acquire(redis: Redis, consumerId: string): Promise<boolean> {
		const acquired = await redis.set(
			this._lockKey(),
			consumerId,
			REDIS_SET.EX,
			30,
			REDIS_SET.NX
		);
		if (!acquired) {
			logger.info(
				"claimPendingMessages: lock held by another instance — skipping"
			);
			return false;
		}
		return true;
	}

	async release(redis: Redis, consumerId: string): Promise<void> {
		try {
			await redis.eval(
				"if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
				1,
				this._lockKey(),
				consumerId
			);
		} catch {
			logger.debug("Claim lock release failed (best-effort)");
		}
	}
}
