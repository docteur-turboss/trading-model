import { DurationMs } from "@trading-model/common/domain/primitives";
import {
	REDIS_RESP,
	REDIS_SET,
} from "@trading-model/common/persistence/redis-constants";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { IDistributedLock } from "@trading-model/validation/adapters/outbound/distributed-lock.types";
import type { Redis } from "ioredis";
import { logger } from "./logger";

const LOCK_PREFIX = "dlq:lock:";
const LOCK_TTL_SECONDS = 30; // Auto-release if process crashes

export class DistributedLock implements IDistributedLock {
	private readonly _renewalInterval = new TimerHandle();
	private _currentLockId = "";

	constructor(
		private readonly _redis: Redis,
		private readonly _lockName: string
	) {}

	private get _key(): string {
		return `${LOCK_PREFIX}${this._lockName}`;
	}

	async acquire(lockId?: string): Promise<boolean> {
		const id = lockId ?? "";
		const acquired = await this._redis.set(
			this._key,
			id,
			REDIS_SET.EX,
			LOCK_TTL_SECONDS,
			REDIS_SET.NX
		);
		if (acquired === REDIS_RESP.OK) {
			this._currentLockId = id;
			this._startRenewal(id);
			return true;
		}
		return false;
	}

	private _startRenewal(lockId: string): void {
		this._renewalInterval.startInterval(
			() => this._renewLock(lockId),
			DurationMs.of((LOCK_TTL_SECONDS / 2) * 1000)
		);
	}

	private async _renewLock(lockId: string): Promise<void> {
		try {
			await this._redis.set(
				this._key,
				lockId,
				REDIS_SET.EX,
				LOCK_TTL_SECONDS,
				REDIS_SET.XX
			);
		} catch (err) {
			logger.warn("Failed to renew distributed lock", {
				lockName: this._lockName,
				err: (err as Error).message,
			});
		}
	}

	async release(lockId?: string): Promise<void> {
		this._renewalInterval.stop();
		const id = lockId ?? this._currentLockId;
		if (!id) {
			return;
		}
		await this._execReleaseScript(id);
	}

	private async _execReleaseScript(lockId: string): Promise<void> {
		const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
		await this._redis.eval(script, 1, this._key, lockId);
	}
}
