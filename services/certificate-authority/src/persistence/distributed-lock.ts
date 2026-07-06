import { randomUUID } from "node:crypto";
import path from "node:path";
import type { IDistributedLock } from "@trading-model/common/contracts/distributed-lock.types";
import { LockAcquisitionChain } from "./lock-acquisition-chain";
import type { LockContext } from "./lock-backends";
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

export class DistributedLock implements IDistributedLock {
	private readonly _context: LockContext;
	private readonly _ttlMs: number;
	private _currentFencingToken = -1;

	private readonly _connectionManager: LockConnectionManager;
	private readonly _redisBackend: RedisLockBackend | NullLockBackend;
	private readonly _filesystemBackend: FileSystemLockBackend;
	private readonly _acquisitionChain: LockAcquisitionChain;

	constructor(options: DistributedLockOptions) {
		this._context = {
			lockName: options.lockName,
			instanceId: randomUUID().substring(0, 8),
		};
		this._ttlMs = options.ttlMs;
		this._connectionManager = new LockConnectionManager(
			options.uri,
			options.fallbackDir
		);
		this._redisBackend = options.redisUrl
			? new RedisLockBackend(options.redisUrl)
			: new NullLockBackend();
		this._filesystemBackend = new FileSystemLockBackend(
			options.fallbackDir ??
				path.join(process.cwd(), "data", "ca-fallback", "locks")
		);
		this._acquisitionChain = new LockAcquisitionChain(
			this._connectionManager,
			this._redisBackend,
			this._filesystemBackend
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
		const mongoResult =
			await this._connectionManager.mongoBackend.verifyOwnership(
				this._context,
				this._currentFencingToken
			);
		if (mongoResult >= 0) {
			return mongoResult;
		}
		const redisResult = await this._redisBackend.verifyOwnership(
			this._context,
			this._currentFencingToken
		);
		if (redisResult >= 0) {
			return redisResult;
		}
		this._currentFencingToken = -1;
		return -1;
	}

	async acquire(lockId?: string): Promise<boolean> {
		const token = await this._acquisitionChain.acquire(
			this._context,
			this._ttlMs,
			lockId
		);
		if (token !== null) {
			this._currentFencingToken = token;
			return true;
		}
		return false;
	}

	async release(): Promise<void> {
		const savedToken = this._currentFencingToken;
		this._currentFencingToken = -1;
		await this._acquisitionChain.release(this._context, savedToken);
	}
}
