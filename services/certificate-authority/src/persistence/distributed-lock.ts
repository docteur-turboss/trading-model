import { randomUUID } from "node:crypto";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import { type Collection, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";
import type { LockDocument } from "./lock-backends";
import {
	FileSystemLockBackend,
	MongoLockBackend,
	RedisLockBackend,
} from "./lock-backends";

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

	constructor(options: DistributedLockOptions) {
		this._client = new MongoClient(options.uri);
		this._lockName = options.lockName;
		this._ttlMs = options.ttlMs;
		this._instanceId = randomUUID().substring(0, 8);

		const fallbackDir =
			options.fallbackDir ??
			path.join(process.cwd(), "data", "ca-fallback", "locks");

		this._mongoBackend = new MongoLockBackend(
			() => this._collection,
			() => {
				this._mongoAvailable = false;
			}
		);
		this._redisBackend = new RedisLockBackend(options.redisUrl ?? null);
		this._filesystemBackend = new FileSystemLockBackend(fallbackDir);
	}

	async connect(): Promise<void> {
		try {
			if (MONGO_MANAGER.isInitialized()) {
				this._client = MONGO_MANAGER.getClient();
				const db = MONGO_MANAGER.getDb();
				this._collection = db.collection<LockDocument>("locks");
			} else {
				await this._client.connect();
				const db = this._client.db();
				this._collection = db.collection<LockDocument>("locks");
			}
			this._mongoAvailable = true;
			this._mongoBackend.setConnected(true);
			await this._collection!.createIndex({ name: 1 }, { unique: true });
			await this._collection!.createIndex(
				{ expiresAt: 1 },
				{ expireAfterSeconds: 0 }
			);
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

	async verifyOwnership(): Promise<number> {
		if (this._currentFencingToken < 0) {
			return -1;
		}

		const mongoResult = await this._mongoBackend.verifyOwnership(
			this._lockName,
			this._instanceId,
			this._currentFencingToken
		);
		if (mongoResult >= 0) {
			return mongoResult;
		}

		const redisResult = await this._redisBackend.verifyOwnership(
			this._lockName,
			this._instanceId,
			this._currentFencingToken
		);
		if (redisResult >= 0) {
			return redisResult;
		}

		this._currentFencingToken = -1;
		return -1;
	}

	async acquire(redisUrl?: string): Promise<boolean> {
		const effectiveRedisUrl: string | null = redisUrl ?? null;

		if (this._mongoAvailable) {
			const mongoResult = await this._mongoBackend.acquire(
				this._lockName,
				this._instanceId,
				this._ttlMs
			);
			if (mongoResult !== null) {
				this._currentFencingToken = mongoResult;
				return true;
			}
			if (this._mongoAvailable) {
				return false;
			}
		}

		if (effectiveRedisUrl) {
			const redisBackend = new RedisLockBackend(effectiveRedisUrl);
			const redisResult = await redisBackend.acquire(
				this._lockName,
				this._instanceId,
				this._ttlMs
			);
			if (redisResult !== null) {
				this._currentFencingToken = redisResult;
				return true;
			}
			return false;
		}

		const redisResult = await this._redisBackend.acquire(
			this._lockName,
			this._instanceId,
			this._ttlMs
		);
		if (redisResult !== null) {
			this._currentFencingToken = redisResult;
			return true;
		}

		const fsResult = await this._filesystemBackend.acquire(
			this._lockName,
			this._instanceId,
			this._ttlMs
		);
		if (fsResult !== null && fsResult > 0) {
			this._currentFencingToken = fsResult;
			return true;
		}
		return false;
	}

	async release(): Promise<void> {
		const savedToken = this._currentFencingToken;
		this._currentFencingToken = -1;

		if (
			await this._mongoBackend.release(
				this._lockName,
				this._instanceId,
				savedToken
			)
		) {
			return;
		}
		if (
			await this._redisBackend.release(
				this._lockName,
				this._instanceId,
				savedToken
			)
		) {
			return;
		}
		await this._filesystemBackend.release(
			this._lockName,
			this._instanceId,
			savedToken
		);
	}
}
