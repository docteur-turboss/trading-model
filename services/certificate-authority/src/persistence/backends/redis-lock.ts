import { randomInt } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { RedisLockConnector } from "../redis-lock-connector";
import type { LockBackend, LockContext } from "./lock-backend-interface";

export class RedisLockBackend implements LockBackend {
	private readonly _connector: RedisLockConnector;

	constructor(redisUrl: string) {
		this._connector = new RedisLockConnector(redisUrl);
	}

	async acquire(context: LockContext, ttlMs: number): Promise<number | null> {
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const nextFencingToken = randomInt(1, 2_147_483_647);
			const value = `${instanceId}:${nextFencingToken}`;
			const acquired = await this._connector.client.set(
				lockKey,
				value,
				"PX",
				ttlMs,
				"NX"
			);
			if (acquired === "OK") {
				this._connector.available = true;
				return nextFencingToken;
			}
			const existing = await this._connector.client.get(lockKey);
			if (existing === null) {
				return this.acquire(context, ttlMs);
			}
			return null;
		} catch (err) {
			logger.warn("Redis lock acquire failed", { context: { err } });
			this._connector.available = false;
			return null;
		}
	}

	async release(context: LockContext, fencingToken: number): Promise<boolean> {
		if (!this._connector.available) {
			return false;
		}
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
			await this._connector.client.eval(
				script,
				1,
				lockKey,
				`${instanceId}:${fencingToken}`
			);
			return true;
		} catch {
			return false;
		}
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._connector.available) {
			return -1;
		}
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const val = await this._connector.client.get(lockKey);
			if (val !== `${instanceId}:${fencingToken}`) {
				return -1;
			}
			return fencingToken;
		} catch {
			return -1;
		}
	}

	disconnect(): void {
		this._connector.disconnect();
	}
}
