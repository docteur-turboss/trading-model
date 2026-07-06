import { randomUUID } from "node:crypto";
import path from "node:path";
import type { LockBackend } from "./lock-backends";
import {
	FileSystemLockBackend,
	NullLockBackend,
	RedisLockBackend,
} from "./lock-backends";
import { LockConnectionManager } from "./lock-connection-manager";

export interface DistributedLockOptions {
	uri: string;
	lockName: string;
	ttlMs: number;
	redisUrl?: string;
	fallbackDir?: string;
}

export class DistributedLock {
	private readonly _lockName: string;
	private readonly _ttlMs: number;
	private readonly _instanceId: string;
	private _currentFencingToken = -1;

	private readonly _connectionManager: LockConnectionManager;
	private readonly _redisBackend: LockBackend;
	private readonly _filesystemBackend: FileSystemLockBackend;

	constructor(options: DistributedLockOptions) {
		this._lockName = options.lockName;
		this._ttlMs = options.ttlMs;
		this._instanceId = randomUUID().substring(0, 8);
		this._connectionManager = new LockConnectionManager(options.uri, options.fallbackDir);
		this._redisBackend = options.redisUrl ? new RedisLockBackend(options.redisUrl) : new NullLockBackend();
		this._filesystemBackend = new FileSystemLockBackend(
			options.fallbackDir ?? path.join(process.cwd(), "data", "ca-fallback", "locks")
		);
	}

	async connect(): Promise<void> {
		return this._connectionManager.connect();
	}

	async disconnect(): Promise<void> {
		await this._connectionManager.disconnect();
		this._redisBackend.disconnect?.();
	}

	async verifyOwnership(): Promise<number> {
		if (this._currentFencingToken < 0) {
			return -1;
		}
		const mongoResult = await this._connectionManager.mongoBackend.verifyOwnership(
			this._lockName, this._instanceId, this._currentFencingToken
		);
		if (mongoResult >= 0) return mongoResult;
		const redisResult = await this._redisBackend.verifyOwnership(
			this._lockName, this._instanceId, this._currentFencingToken
		);
		if (redisResult >= 0) return redisResult;
		this._currentFencingToken = -1;
		return -1;
	}

	private async _tryMongoAcquire(): Promise<number | null> {
		if (!this._connectionManager.isAvailable) {
			return null;
		}
		const result = await this._connectionManager.mongoBackend.acquire(
			this._lockName, this._instanceId, this._ttlMs
		);
		if (result !== null) return result;
		return this._connectionManager.isAvailable ? -1 : null;
	}

	private async _tryRedisAcquire(redisUrl?: string): Promise<number | null> {
		const backend = redisUrl ? new RedisLockBackend(redisUrl) : this._redisBackend;
		return backend.acquire(this._lockName, this._instanceId, this._ttlMs);
	}

	private async _tryFsAcquire(): Promise<number | null> {
		return this._filesystemBackend.acquire(this._lockName, this._instanceId, this._ttlMs);
	}

	async acquire(redisUrl?: string): Promise<boolean> {
		const mongoResult = await this._tryMongoAcquire();
		if (mongoResult !== null) {
			if (mongoResult >= 0) {
				this._currentFencingToken = mongoResult;
				return true;
			}
			return false;
		}

		const redisResult = await this._tryRedisAcquire(redisUrl);
		if (redisResult !== null) {
			this._currentFencingToken = redisResult;
			return true;
		}

		if (!redisUrl) {
			const fsResult = await this._tryFsAcquire();
			if (fsResult !== null && fsResult > 0) {
				this._currentFencingToken = fsResult;
				return true;
			}
		}
		return false;
	}

	private async _releaseOnBackend(backend: { release(name: string, instanceId: string, token: number): Promise<boolean> }, token: number): Promise<boolean> {
		return backend.release(this._lockName, this._instanceId, token);
	}

	async release(): Promise<void> {
		const savedToken = this._currentFencingToken;
		this._currentFencingToken = -1;
		if (await this._releaseOnBackend(this._connectionManager.mongoBackend, savedToken)) return;
		if (await this._releaseOnBackend(this._redisBackend, savedToken)) return;
		await this._filesystemBackend.release(this._lockName, this._instanceId, savedToken);
	}
}
