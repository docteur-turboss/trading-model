import { randomUUID } from "node:crypto";
import path from "node:path";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { IDistributedLock } from "@trading-model/common/contracts/distributed-lock.types";
import { LockAcquisitionChain } from "./lock-acquisition-chain";
import type { LockBackend, LockContext } from "./lock-backends";
import { FileSystemLockBackend, RedisLockBackend } from "./lock-backends";
import { LockConnectionManager } from "./lock-connection-manager";

export interface DistributedLockOptions {
	uri: string;
	lockName: string;
	ttlMs: number;
	redisUrl?: string;
	fallbackDir?: string;
}

export class DistributedLock implements IDistributedLock {
	private _currentFencingToken = -1;
	private readonly _acquisitionChain: LockAcquisitionChain;

	constructor(
		private readonly _context: LockContext,
		private readonly _ttlMs: number,
		private readonly _backends: LockBackend[],
		private readonly _connectionManager?: LockConnectionManager
	) {
		this._acquisitionChain = new LockAcquisitionChain(this._backends);
	}

	async connect(): Promise<void> {
		await this._connectionManager?.connect();
	}

	async disconnect(): Promise<void> {
		await this._connectionManager?.disconnect();
		for (const backend of this._backends) {
			backend.disconnect?.();
		}
	}

	async verifyOwnership(): Promise<number> {
		if (this._currentFencingToken < 0) {
			return -1;
		}
		for (const backend of this._backends) {
			const result = await backend.verifyOwnership(
				this._context,
				this._currentFencingToken
			);
			if (result >= 0) {
				return result;
			}
		}
		this._currentFencingToken = -1;
		return -1;
	}

	async acquire(_lockId?: string): Promise<boolean> {
		const token = await this._acquisitionChain.acquire(
			this._context,
			this._ttlMs
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

	private static _buildContext(options: DistributedLockOptions): LockContext {
		return {
			lockName: options.lockName,
			instanceId: randomUUID().substring(0, 8) as InstanceId,
		};
	}

	private static _buildBackends(
		options: DistributedLockOptions,
		connectionManager: LockConnectionManager
	): LockBackend[] {
		const backends: LockBackend[] = [connectionManager.mongoBackend];
		if (options.redisUrl) {
			backends.push(new RedisLockBackend(options.redisUrl));
		}
		backends.push(
			new FileSystemLockBackend(
				options.fallbackDir ??
					path.join(process.cwd(), "data", "ca-fallback", "locks")
			)
		);
		return backends;
	}

	static fromOptions(options: DistributedLockOptions): DistributedLock {
		const context = DistributedLock._buildContext(options);
		const connectionManager = new LockConnectionManager(
			options.uri,
			options.fallbackDir
		);
		const backends = DistributedLock._buildBackends(options, connectionManager);
		return new DistributedLock(
			context,
			options.ttlMs,
			backends,
			connectionManager
		);
	}
}
