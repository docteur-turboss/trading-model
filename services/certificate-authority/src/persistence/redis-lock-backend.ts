import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";
import type { LockBackend, LockContext } from "./lock-backends";
import { NullLockBackend } from "./lock-backends";
import { RedisLockRepository } from "./redis-lock-repository";

export class RedisLockBackend implements LockBackend {
	private _client: Redis | null = null;
	private _available = true;
	private readonly _repository = new RedisLockRepository();

	constructor(redisUrl: string) {
		this._connect(redisUrl);
	}

	private _connect(redisUrl: string): void {
		try {
			this._client = new Redis(redisUrl, {
				enableReadyCheck: true, maxRetriesPerRequest: 1, retryStrategy: () => null, lazyConnect: true,
			});
			this._client.on("error", () => { this._available = false; });
		} catch {
			this._available = false;
		}
	}

	async acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		if (!this._client) {
			return null;
		}
		try {
			const result = await this._repository.acquire(this._client, context, ttlMs);
			if (result !== null) {
				this._available = true;
			}
			return result;
		} catch (err) {
			logger.warn("Redis lock acquire failed", { context: { err } });
			this._available = false;
			return null;
		}
	}

	async release(
		context: LockContext,
		fencingToken: number
	): Promise<boolean> {
		if (!this._available || !this._client) {
			return false;
		}
		try {
			await this._repository.release(this._client, context, fencingToken);
			return true;
		} catch {
			return false;
		}
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._available || !this._client) {
			return -1;
		}
		try {
			return await this._repository.verifyOwnership(this._client, context, fencingToken);
		} catch {
			return -1;
		}
	}

	disconnect(): void {
		this._client?.disconnect();
	}
}

export function createRedisLockBackend(redisUrl?: string): LockBackend {
	return redisUrl ? new RedisLockBackend(redisUrl) : new NullLockBackend();
}
