import { randomInt } from "node:crypto";
import Redis from "ioredis";
import type { LockContext } from "./lock-backends";

export class RedisLockRepository {
	async acquire(
		client: Redis,
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		const { lockName, instanceId } = context;
		const lockKey = `lock:${lockName}`;
		const nextFencingToken = randomInt(1, 2_147_483_647);
		const value = `${instanceId}:${nextFencingToken}`;
		const acquired = await client.set(
			lockKey,
			value,
			"PX",
			ttlMs,
			"NX"
		);
		if (acquired === "OK") {
			return nextFencingToken;
		}
		const existing = await client.get(lockKey);
		if (existing === null) {
			return this.acquire(client, context, ttlMs);
		}
		return null;
	}

	async release(
		client: Redis,
		context: LockContext,
		fencingToken: number
	): Promise<void> {
		const { lockName, instanceId } = context;
		const lockKey = `lock:${lockName}`;
		const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
		await client.eval(
			script,
			1,
			lockKey,
			`${instanceId}:${fencingToken}`
		);
	}

	async verifyOwnership(
		client: Redis,
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		const { lockName, instanceId } = context;
		const lockKey = `lock:${lockName}`;
		const val = await client.get(lockKey);
		if (val !== `${instanceId}:${fencingToken}`) {
			return -1;
		}
		return fencingToken;
	}
}
