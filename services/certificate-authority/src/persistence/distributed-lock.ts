import { randomInt, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";
import { type Collection, MongoClient } from "mongodb";

import { MONGO_MANAGER } from "./mongo-manager";

interface LockDocument {
	name: string;
	acquiredAt: Date;
	expiresAt: Date;
	instanceId: string;
	fencingToken: number;
}

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
	private _mongoConnected = false;
	private _redisAvailable = false;
	private _redisClient: Redis | null = null;
	private readonly _redisUrl: string | null;
	private readonly _fallbackDir: string;
	private _currentFencingToken = -1;

	constructor(options: DistributedLockOptions) {
		this._client = new MongoClient(options.uri);
		this._lockName = options.lockName;
		this._ttlMs = options.ttlMs;
		this._instanceId = randomUUID().substring(0, 8);
		this._redisUrl = options.redisUrl ?? null;
		this._fallbackDir =
			options.fallbackDir ??
			path.join(process.cwd(), "data", "ca-fallback", "locks");
	}

	async connect(): Promise<void> {
		try {
			if (MONGO_MANAGER.isInitialized()) {
				this._client = MONGO_MANAGER.getClient();
				const db = MONGO_MANAGER.getDb();
				this._collection = db.collection<LockDocument>("locks");
				this._mongoConnected = true;
			} else {
				await this._client.connect();
				const db = this._client.db();
				this._collection = db.collection<LockDocument>("locks");
				this._mongoConnected = true;
			}
			await this._collection!.createIndex({ name: 1 }, { unique: true });
			await this._collection!.createIndex(
				{ expiresAt: 1 },
				{ expireAfterSeconds: 0 }
			);
		} catch (err) {
			logger.warn("MongoDB lock connection failed", { err });
		}
	}

	private _connectRedis(redisUrl: string): void {
		try {
			this._redisClient = new Redis(redisUrl, {
				enableReadyCheck: true,
				maxRetriesPerRequest: 1,
				retryStrategy: () => null,
				lazyConnect: true,
			});
			this._redisClient.on("error", () => {
				this._redisAvailable = false;
			});
		} catch {
			this._redisClient = null;
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
		this._redisClient?.disconnect();
	}

	/**
	 * Returns the fencing token if the lock is still held by this instance,
	 * or -1 if the lock was lost (stolen by another instance).
	 */
	async verifyOwnership(): Promise<number> {
		if (this._currentFencingToken < 0) {
			return -1;
		}

		if (this._mongoConnected && this._collection) {
			try {
				const doc = await this._collection.findOne({ name: this._lockName });
				if (
					!doc ||
					doc.instanceId !== this._instanceId ||
					doc.fencingToken !== this._currentFencingToken
				) {
					this._currentFencingToken = -1;
					return -1;
				}
				return this._currentFencingToken;
			} catch {
				this._mongoConnected = false;
			}
		}

		if (this._redisClient && this._redisAvailable) {
			try {
				const lockKey = `lock:${this._lockName}`;
				const val = await this._redisClient.get(lockKey);
				if (val !== `${this._instanceId}:${this._currentFencingToken}`) {
					this._currentFencingToken = -1;
					return -1;
				}
				return this._currentFencingToken;
			} catch {
				// ignore
			}
		}

		this._currentFencingToken = -1;
		return -1;
	}

	async acquire(redisUrl?: string): Promise<boolean> {
		const effectiveRedisUrl: string | undefined =
			redisUrl ?? this._redisUrl ?? undefined;

		// 1. Try MongoDB
		if (this._mongoConnected && this._collection) {
			try {
				const now = new Date();
				const expiresAt = new Date(now.getTime() + this._ttlMs);
				const prev = await this._collection.findOne({ name: this._lockName });
				const nextFencingToken = (prev?.fencingToken ?? 0) + 1;
				const result = await this._collection.findOneAndUpdate(
					{
						name: this._lockName,
						$or: [
							{ expiresAt: { $lt: now } },
							{ expiresAt: { $exists: false } },
						],
					},
					{
						$set: {
							name: this._lockName,
							acquiredAt: now,
							expiresAt,
							instanceId: this._instanceId,
							fencingToken: nextFencingToken,
						},
					},
					{ upsert: true, returnDocument: "before" }
				);
				const acquired =
					result === null || (result.expiresAt && result.expiresAt < now);
				if (acquired) {
					this._currentFencingToken = nextFencingToken;
				}
				return acquired;
			} catch (err) {
				logger.warn("MongoDB lock acquire failed, falling back to Redis", {
					err,
				});
				this._mongoConnected = false;
			}
		}

		// 2. Try Redis (distributed, shared across instances)
		if (effectiveRedisUrl && !this._redisClient) {
			this._connectRedis(effectiveRedisUrl);
		}
		if (this._redisClient) {
			try {
				const lockKey = `lock:${this._lockName}`;
				const nextFencingToken = randomInt(1, 2_147_483_647);
				const value = `${this._instanceId}:${nextFencingToken}`;
				const acquired = await this._redisClient.set(
					lockKey,
					value,
					"PX",
					this._ttlMs,
					"NX"
				);
				if (acquired === "OK") {
					this._redisAvailable = true;
					this._currentFencingToken = nextFencingToken;
					return true;
				}
				const existing = await this._redisClient.get(lockKey);
				if (existing === null) {
					return this.acquire(effectiveRedisUrl);
				}
				return false;
			} catch (err) {
				logger.warn("Redis lock acquire failed, using local fallback", { err });
				this._redisClient = null;
			}
		}

		// 3. Local fallback: file-based lock with TTL (single instance only — dev only)
		if (
			process.env.NODE_ENV === "development" ||
			process.env.NODE_ENV === "test"
		) {
			try {
				await fs.mkdir(this._fallbackDir, { recursive: true });
				const lockFile = path.join(this._fallbackDir, `${this._lockName}.lock`);
				try {
					const existing = await fs.readFile(lockFile, "utf8");
					const data = JSON.parse(existing);
					if (Date.now() - data.acquiredAt < this._ttlMs) {
						return false;
					}
				} catch {
					// file doesn't exist or is invalid — lock is free
				}
				const fencingToken = Date.now();
				await fs.writeFile(
					lockFile,
					JSON.stringify({
						instanceId: this._instanceId,
						acquiredAt: Date.now(),
						ttlMs: this._ttlMs,
						fencingToken,
					}),
					{ mode: 0o600 }
				);
				this._currentFencingToken = fencingToken;
				return true;
			} catch {
				logger.error("All lock backends failed — unable to acquire lock");
				return false;
			}
		}
		logger.error(
			"No lock backend available (MongoDB, Redis) and filesystem fallback is disabled in production"
		);
		return false;
	}

	async release(): Promise<void> {
		const savedToken = this._currentFencingToken;
		this._currentFencingToken = -1;

		if (this._mongoConnected && this._collection) {
			try {
				await this._collection.deleteOne({
					name: this._lockName,
					instanceId: this._instanceId,
					fencingToken: savedToken,
				});
				return;
			} catch {
				this._mongoConnected = false;
			}
		}
		if (this._redisClient && this._redisAvailable) {
			try {
				const lockKey = `lock:${this._lockName}`;
				const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
				await this._redisClient.eval(
					script,
					1,
					lockKey,
					`${this._instanceId}:${savedToken}`
				);
				return;
			} catch {
				// ignore
			}
		}
		try {
			const lockFile = path.join(this._fallbackDir, `${this._lockName}.lock`);
			await fs.unlink(lockFile);
		} catch {
			// ignore
		}
	}
}
