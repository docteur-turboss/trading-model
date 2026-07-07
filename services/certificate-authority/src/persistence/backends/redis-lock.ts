import { randomInt } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { RedisLockConnector } from "../redis-lock-connector";
import type { LockBackend, LockContext } from "./lock-backend-interface";

export class RedisLockBackend implements LockBackend {
	private readonly _connector: RedisLockConnector;

	constructor(redisUrl: string) {
		this._connector = new RedisLockConnector(redisUrl);
	}

	private _buildLockKey(lockName: string): string {
		return `lock:${lockName}`;
	}

	private _buildLockValue(instanceId: string, token: number): string {
		return `${instanceId}:${token}`;
	}

	private _releaseScript(): string {
		return `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
	}

	async acquire(context: LockContext, ttlMs: number): Promise<number | null> {
		const { lockName, instanceId } = context;
		try {
			const lockKey = this._buildLockKey(lockName);
			const nextFencingToken = randomInt(1, 2_147_483_647);
			const value = this._buildLockValue(instanceId, nextFencingToken);
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
			const lockKey = this._buildLockKey(lockName);
			await this._connector.client.eval(
				this._releaseScript(),
				1,
				lockKey,
				this._buildLockValue(instanceId, fencingToken)
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
			const lockKey = this._buildLockKey(lockName);
			const val = await this._connector.client.get(lockKey);
			if (val !== this._buildLockValue(instanceId, fencingToken)) {
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
