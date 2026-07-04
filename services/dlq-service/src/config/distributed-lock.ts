import type { Redis } from "ioredis";

const LOCK_PREFIX = "dlq:lock:";
const LOCK_TTL = 30; // Seconds — auto-release if process crashes

export class DistributedLock {
	private _renewalInterval: ReturnType<typeof setInterval> | null = null;

	constructor(
		private readonly _redis: Redis,
		private readonly _lockName: string
	) {}

	private get _key(): string {
		return `${LOCK_PREFIX}${this._lockName}`;
	}

	async acquire(instanceId: string): Promise<boolean> {
		const acquired = await this._redis.set(
			this._key,
			instanceId,
			"EX",
			LOCK_TTL,
			"NX"
		);
		if (acquired === "OK") {
			this._startRenewal(instanceId);
			return true;
		}
		return false;
	}

	private _startRenewal(instanceId: string): void {
		if (this._renewalInterval) {
			clearInterval(this._renewalInterval);
		}
		this._renewalInterval = setInterval(
			async () => {
				try {
					await this._redis.set(this._key, instanceId, "EX", LOCK_TTL, "XX");
				} catch {
					// Logged by caller
				}
			},
			(LOCK_TTL / 2) * 1000
		);
	}

	async release(instanceId: string): Promise<void> {
		if (this._renewalInterval) {
			clearInterval(this._renewalInterval);
			this._renewalInterval = null;
		}
		// Lua script: only delete if we still own the lock
		const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
		await this._redis.eval(script, 1, this._key, instanceId);
	}
}
