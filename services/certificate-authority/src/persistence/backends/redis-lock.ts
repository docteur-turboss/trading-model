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

	private async _trySetLock(
		lockKey: string,
		value: string,
		ttlMs: number,
		nextFencingToken: number
	): Promise<number | null | undefined> {
		const acquired = await this._connector.client.set(lockKey, value, "PX", ttlMs, "NX");
		if (acquired === "OK") {
			this._connector.available = true;
			return nextFencingToken;
		}
		return undefined;
	}

	private async _retryOrNull(
		context: LockContext,
		ttlMs: number,
		lockKey: string
	): Promise<number | null> {
		const existing = await this._connector.client.get(lockKey);
		if (existing === null) {
			return this.acquire(context, ttlMs);
		}
		return null;
	}

	private _handleAcquireError(err: unknown): void {
		logger.warn("Redis lock acquire failed", { context: { err } });
		this._connector.available = false;
	}

	async acquire(context: LockContext, ttlMs: number): Promise<number | null> {
		const { lockName, instanceId } = context;
		try {
			const lockKey = this._buildLockKey(lockName);
			const nextFencingToken = randomInt(1, 2_147_483_647);
			const value = this._buildLockValue(instanceId, nextFencingToken);
			const result = await this._trySetLock(lockKey, value, ttlMs, nextFencingToken);
			if (result !== undefined) return result;
			return this._retryOrNull(context, ttlMs, lockKey);
		} catch (err) {
			this._handleAcquireError(err);
			return null;
		}
	}

	private async _executeRelease(lockKey: string, value: string): Promise<boolean> {
		try {
			await this._connector.client.eval(this._releaseScript(), 1, lockKey, value);
			return true;
		} catch {
			return false;
		}
	}

	async release(context: LockContext, fencingToken: number): Promise<boolean> {
		if (!this._connector.available) {
			return false;
		}
		const { lockName, instanceId } = context;
		return this._executeRelease(
			this._buildLockKey(lockName),
			this._buildLockValue(instanceId, fencingToken)
		);
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
