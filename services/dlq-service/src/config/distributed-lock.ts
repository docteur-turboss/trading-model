import type { IDistributedLock } from "@trading-model/common/contracts/distributed-lock.types";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { Redis } from "ioredis";

const LOCK_PREFIX = "dlq:lock:";
const LOCK_TTL = 30; // Seconds — auto-release if process crashes

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
		const acquired = await this._redis.set(this._key, id, "EX", LOCK_TTL, "NX");
		if (acquired === "OK") {
			this._currentLockId = id;
			this._startRenewal(id);
			return true;
		}
		return false;
	}

	private _startRenewal(lockId: string): void {
		this._renewalInterval.startInterval(
			() => this._renewLock(lockId),
			(LOCK_TTL / 2) * 1000
		);
	}

	private async _renewLock(lockId: string): Promise<void> {
		try {
			await this._redis.set(this._key, lockId, "EX", LOCK_TTL, "XX");
		} catch {}
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
