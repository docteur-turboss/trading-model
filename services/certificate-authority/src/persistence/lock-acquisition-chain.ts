import type { LockBackend, LockContext } from "./lock-backends";
import { RedisLockBackend } from "./lock-backends";
import { LockConnectionManager } from "./lock-connection-manager";

export class LockAcquisitionChain {
	constructor(
		private readonly _connectionManager: LockConnectionManager,
		private readonly _redisBackend: LockBackend,
		private readonly _filesystemBackend: LockBackend,
	) {}

	async acquire(
		context: LockContext,
		ttlMs: number,
		redisUrl?: string
	): Promise<number | null> {
		const mongoResult = await this._tryMongoAcquire(context, ttlMs);
		if (mongoResult !== null) {
			if (mongoResult >= 0) return mongoResult;
			return null;
		}

		const redisResult = await this._tryRedisAcquire(context, ttlMs, redisUrl);
		if (redisResult !== null) {
			return redisResult;
		}

		if (!redisUrl) {
			const fsResult = await this._filesystemBackend.acquire(context, ttlMs);
			if (fsResult !== null && fsResult > 0) {
				return fsResult;
			}
		}
		return null;
	}

	async release(context: LockContext, savedToken: number): Promise<void> {
		if (await this._releaseOnBackend(this._connectionManager.mongoBackend, context, savedToken)) return;
		if (await this._releaseOnBackend(this._redisBackend, context, savedToken)) return;
		await this._filesystemBackend.release(context, savedToken);
	}

	private async _tryMongoAcquire(context: LockContext, ttlMs: number): Promise<number | null> {
		if (!this._connectionManager.isAvailable) {
			return null;
		}
		const result = await this._connectionManager.mongoBackend.acquire(context, ttlMs);
		if (result !== null) return result;
		return this._connectionManager.isAvailable ? -1 : null;
	}

	private async _tryRedisAcquire(context: LockContext, ttlMs: number, redisUrl?: string): Promise<number | null> {
		const backend = redisUrl ? new RedisLockBackend(redisUrl) : this._redisBackend;
		return backend.acquire(context, ttlMs);
	}

	private async _releaseOnBackend(backend: LockBackend, context: LockContext, token: number): Promise<boolean> {
		return backend.release(context, token);
	}
}
