import { randomInt } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";
import type { LockBackend } from "./lock-backends";

export class RedisLockBackend implements LockBackend {
	private _client: Redis | null = null;
	private _available = false;

	constructor(redisUrl: string | null) {
		if (redisUrl) {
			this._connect(redisUrl);
		}
	}

	private _connect(redisUrl: string): void {
		try {
			this._client = new Redis(redisUrl, {
				enableReadyCheck: true, maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true,
			});
			this._client.on("error", () => { this._available = false; });
		} catch {
			this._client = null;
		}
	}

	async acquire(
		lockName: string,
		instanceId: string,
		ttlMs: number
	): Promise<number | null> {
		if (!this._client) {
			return null;
		}
		try {
			const lockKey = `lock:${lockName}`;
			const nextFencingToken = randomInt(1, 2_147_483_647);
			const value = `${instanceId}:${nextFencingToken}`;
			const acquired = await this._client.set(
				lockKey,
				value,
				"PX",
				ttlMs,
				"NX"
			);
			if (acquired === "OK") {
				this._available = true;
				return nextFencingToken;
			}
			const existing = await this._client.get(lockKey);
			if (existing === null) {
				return this.acquire(lockName, instanceId, ttlMs);
			}
			return null;
		} catch (err) {
			logger.warn("Redis lock acquire failed", { context: { err } });
			this._client = null;
			return null;
		}
	}

	async release(
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<boolean> {
		if (!(this._client && this._available)) {
			return false;
		}
		try {
			const lockKey = `lock:${lockName}`;
			const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
			await this._client.eval(
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
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<number> {
		if (!(this._client && this._available)) {
			return -1;
		}
		try {
			const lockKey = `lock:${lockName}`;
			const val = await this._client.get(lockKey);
			if (val !== `${instanceId}:${fencingToken}`) {
				return -1;
			}
			return fencingToken;
		} catch {
			return -1;
		}
	}

	disconnect(): void {
		this._client?.disconnect();
	}
}
