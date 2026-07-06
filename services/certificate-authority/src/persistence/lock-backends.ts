import { randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";
import type { Collection } from "mongodb";

export interface LockDocument {
	name: string;
	acquiredAt: Date;
	expiresAt: Date;
	instanceId: string;
	fencingToken: number;
}

export interface LockBackend {
	acquire(
		lockName: string,
		instanceId: string,
		ttlMs: number
	): Promise<number | null>;
	release(
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<boolean>;
	verifyOwnership(
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<number>;
}

export class MongoLockBackend implements LockBackend {
	private _connected = false;

	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void
	) {}

	setConnected(value: boolean): void {
		this._connected = value;
	}

	async acquire(
		lockName: string,
		instanceId: string,
		ttlMs: number
	): Promise<number | null> {
		if (!this._connected) {
			return null;
		}
		const collection = this._collection();
		if (!collection) {
			return null;
		}
		try {
			const now = new Date();
			const expiresAt = new Date(now.getTime() + ttlMs);
			const prev = await collection.findOne({ name: lockName });
			const nextFencingToken = (prev?.fencingToken ?? 0) + 1;
			const result = await collection.findOneAndUpdate(
				{
					name: lockName,
					$or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
				},
				{
					$set: {
						name: lockName,
						acquiredAt: now,
						expiresAt,
						instanceId,
						fencingToken: nextFencingToken,
					},
				},
				{ upsert: true, returnDocument: "before" }
			);
			const acquired =
				result === null || (result.expiresAt && result.expiresAt < now);
			return acquired ? nextFencingToken : null;
		} catch (err) {
			logger.warn("MongoDB lock acquire failed", { context: { err } });
			this._connected = false;
			this._onDisconnect();
			return null;
		}
	}

	async release(
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<boolean> {
		if (!this._connected) {
			return false;
		}
		const collection = this._collection();
		if (!collection) {
			return false;
		}
		try {
			await collection.deleteOne({
				name: lockName,
				instanceId,
				fencingToken,
			});
			return true;
		} catch {
			this._connected = false;
			this._onDisconnect();
			return false;
		}
	}

	async verifyOwnership(
		lockName: string,
		instanceId: string,
		fencingToken: number
	): Promise<number> {
		if (!this._connected) {
			return -1;
		}
		const collection = this._collection();
		if (!collection) {
			return -1;
		}
		try {
			const doc = await collection.findOne({ name: lockName });
			if (
				!doc ||
				doc.instanceId !== instanceId ||
				doc.fencingToken !== fencingToken
			) {
				return -1;
			}
			return fencingToken;
		} catch {
			this._connected = false;
			this._onDisconnect();
			return -1;
		}
	}
}

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

export class FileSystemLockBackend implements LockBackend {
	constructor(private readonly _fallbackDir: string) {}

	async acquire(
		lockName: string,
		instanceId: string,
		ttlMs: number
	): Promise<number | null> {
		if (
			process.env.NODE_ENV !== "development" &&
			process.env.NODE_ENV !== "test"
		) {
			logger.error(
				"No lock backend available (MongoDB, Redis) and filesystem fallback is disabled in production"
			);
			return null;
		}
		try {
			await fs.mkdir(this._fallbackDir, { recursive: true });
			const lockFile = path.join(this._fallbackDir, `${lockName}.lock`);
			try {
				const existing = await fs.readFile(lockFile, "utf8");
				const data = JSON.parse(existing);
				if (Date.now() - data.acquiredAt < ttlMs) {
					return null;
				}
			} catch {
				// file doesn't exist or is invalid
			}
			const fencingToken = Date.now();
			await fs.writeFile(
				lockFile,
				JSON.stringify({
					instanceId,
					acquiredAt: Date.now(),
					ttlMs,
					fencingToken,
				}),
				{ mode: 0o600 }
			);
			return fencingToken;
		} catch {
			logger.error("Filesystem lock acquire failed");
			return null;
		}
	}

	async release(
		lockName: string,
		_instanceId: string,
		_fencingToken: number
	): Promise<boolean> {
		try {
			const lockFile = path.join(this._fallbackDir, `${lockName}.lock`);
			await fs.unlink(lockFile);
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
		try {
			const lockFile = path.join(this._fallbackDir, `${lockName}.lock`);
			const content = await fs.readFile(lockFile, "utf8");
			const data = JSON.parse(content);
			if (data.instanceId === instanceId && data.fencingToken === fencingToken) {
				return fencingToken;
			}
			return -1;
		} catch {
			return -1;
		}
	}
}
