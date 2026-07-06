import { randomInt } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import Redis from "ioredis";
import type { Collection } from "mongodb";

import { MongoLockExecutor } from "./mongo-lock-executor";
import { RedisLockConnector } from "./redis-lock-connector";

export interface LockContext {
	lockName: string;
	instanceId: string;
}

export interface LockDocument {
	name: string;
	acquiredAt: Date;
	expiresAt: Date;
	instanceId: string;
	fencingToken: number;
}

export interface LockBackend {
	acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null>;
	release(
		context: LockContext,
		fencingToken: number
	): Promise<boolean>;
	verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number>;
	disconnect?(): void;
}

export class NullLockBackend implements LockBackend {
	async acquire(
		_context: LockContext,
		_ttlMs: number
	): Promise<number | null> {
		return null;
	}

	async release(
		_context: LockContext,
		_fencingToken: number
	): Promise<boolean> {
		return false;
	}

	async verifyOwnership(
		_context: LockContext,
		_fencingToken: number
	): Promise<number> {
		return -1;
	}

	disconnect(): void {}
}

export class MongoLockBackend implements LockBackend {
	private _connected = false;
	private readonly _executor: MongoLockExecutor;

	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void
	) {
		this._executor = new MongoLockExecutor(this._collection, this._onDisconnect);
	}

	setConnected(value: boolean): void {
		this._connected = value;
	}

	async acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		if (!this._connected) {
			return null;
		}
		return this._executor.acquire(context, ttlMs);
	}

	async release(
		context: LockContext,
		fencingToken: number
	): Promise<boolean> {
		if (!this._connected) {
			return false;
		}
		return this._executor.release(context, fencingToken);
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._connected) {
			return -1;
		}
		return this._executor.verifyOwnership(context, fencingToken);
	}
}

export class RedisLockBackend implements LockBackend {
	private readonly _connector: RedisLockConnector;

	constructor(redisUrl: string) {
		this._connector = new RedisLockConnector(redisUrl);
	}

	async acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const nextFencingToken = randomInt(1, 2_147_483_647);
			const value = `${instanceId}:${nextFencingToken}`;
			const acquired = await this._connector.client.set(
				lockKey,
				value,
				"PX",
				ttlMs,
				"NX"
			);
			if (acquired === "OK") {
				this._connector.available = true;
				return nextFencingToken;
			}
			const existing = await this._connector.client.get(lockKey);
			if (existing === null) {
				return this.acquire(context, ttlMs);
			}
			return null;
		} catch (err) {
			logger.warn("Redis lock acquire failed", { context: { err } });
			this._connector.available = false;
			return null;
		}
	}

	async release(
		context: LockContext,
		fencingToken: number
	): Promise<boolean> {
		if (!this._connector.available) {
			return false;
		}
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const script = `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          else
            return 0
          end
        `;
			await this._connector.client.eval(
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
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		if (!this._connector.available) {
			return -1;
		}
		const { lockName, instanceId } = context;
		try {
			const lockKey = `lock:${lockName}`;
			const val = await this._connector.client.get(lockKey);
			if (val !== `${instanceId}:${fencingToken}`) {
				return -1;
			}
			return fencingToken;
		} catch {
			return -1;
		}
	}

	disconnect(): void {
		this._connector.disconnect();
	}
}

export class FileSystemLockBackend implements LockBackend {
	constructor(private readonly _fallbackDir: string) {}

	async acquire(
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		const { lockName, instanceId } = context;
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
		context: LockContext,
		_fencingToken: number
	): Promise<boolean> {
		const { lockName } = context;
		try {
			const lockFile = path.join(this._fallbackDir, `${lockName}.lock`);
			await fs.unlink(lockFile);
			return true;
		} catch {
			return false;
		}
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		const { lockName, instanceId } = context;
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
