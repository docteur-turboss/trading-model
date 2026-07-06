import { randomUUID } from "node:crypto";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";
import type { LockDocument } from "./lock-backends";
import {
	FileSystemLockBackend,
	MongoLockBackend,
	RedisLockBackend,
} from "./lock-backends";
import { MONGO_MANAGER } from "./mongo-manager";

export interface DistributedLockOptions {
	uri: string;
	lockName: string;
	ttlMs: number;
	redisUrl?: string;
	fallbackDir?: string;
}

export class DistributedLock {
	private _client: MongoClient;
	private _collection: Collection<LockDocument> | null = null;
	private readonly _lockName: string;
	private readonly _ttlMs: number;
	private readonly _instanceId: string;
	private _currentFencingToken = -1;
	private _mongoAvailable = false;

	private readonly _mongoBackend: MongoLockBackend;
	private readonly _redisBackend: RedisLockBackend;
	private readonly _filesystemBackend: FileSystemLockBackend;

	private _resolveFallbackDir(fallbackDir: string | undefined): string {
		return fallbackDir ?? path.join(process.cwd(), "data", "ca-fallback", "locks");
	}

	private _createMongoBackend(): MongoLockBackend {
		return new MongoLockBackend(
			() => this._collection,
			() => { this._mongoAvailable = false; }
		);
	}

	constructor(options: DistributedLockOptions) {
		this._client = new MongoClient(options.uri);
		this._lockName = options.lockName;
		this._ttlMs = options.ttlMs;
		this._instanceId = randomUUID().substring(0, 8);
		this._mongoBackend = this._createMongoBackend();
		this._redisBackend = new RedisLockBackend(options.redisUrl ?? null);
		this._filesystemBackend = new FileSystemLockBackend(this._resolveFallbackDir(options.fallbackDir));
	}

	private async _connectViaManager(): Promise<void> {
		this._client = MONGO_MANAGER.getClient();
		const db = MONGO_MANAGER.getDb();
		this._collection = db.collection<LockDocument>("locks");
	}

	private async _connectDirectly(): Promise<void> {
		await this._client.connect();
		const db = this._client.db();
		this._collection = db.collection<LockDocument>("locks");
	}

	private async _createLockIndexes(): Promise<void> {
		await this._collection!.createIndex({ name: 1 }, { unique: true });
		await this._collection!.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
	}

	async connect(): Promise<void> {
		try {
			if (MONGO_MANAGER.isInitialized()) {
				await this._connectViaManager();
			} else {
				await this._connectDirectly();
			}
			this._mongoAvailable = true;
			this._mongoBackend.setConnected(true);
			await this._createLockIndexes();
		} catch (err) {
			logger.warn("MongoDB lock connection failed", { context: { err } });
		}
	}

	async disconnect(): Promise<void> {
		if (!MONGO_MANAGER.isInitialized()) {
			try {
				await this._client.close();
			} catch {
				/* closing */
			}
		}
		this._redisBackend.disconnect();
	}

	private async _checkMongoOwnership(): Promise<number> {
		return this._mongoBackend.verifyOwnership(this._lockName, this._instanceId, this._currentFencingToken);
	}

	private async _checkRedisOwnership(): Promise<number> {
		return this._redisBackend.verifyOwnership(this._lockName, this._instanceId, this._currentFencingToken);
	}

	async verifyOwnership(): Promise<number> {
		if (this._currentFencingToken < 0) {
			return -1;
		}
		const mongoResult = await this._checkMongoOwnership();
		if (mongoResult >= 0) return mongoResult;
		const redisResult = await this._checkRedisOwnership();
		if (redisResult >= 0) return redisResult;
		this._currentFencingToken = -1;
		return -1;
	}

	private async _tryMongoAcquire(): Promise<number | null> {
		if (!this._mongoAvailable) {
			return null;
		}
		const result = await this._mongoBackend.acquire(this._lockName, this._instanceId, this._ttlMs);
		if (result !== null) return result;
		return this._mongoAvailable ? -1 : null;
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
		if (await this._releaseOnBackend(this._mongoBackend, savedToken)) return;
		if (await this._releaseOnBackend(this._redisBackend, savedToken)) return;
		await this._filesystemBackend.release(this._lockName, this._instanceId, savedToken);
	}
}
