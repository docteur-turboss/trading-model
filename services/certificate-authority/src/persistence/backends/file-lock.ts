import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import {
	getNodeEnv,
	isDevelopment,
	NODE_ENV,
} from "@trading-model/common/config/node-env";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import type {
	FilePath,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import type { LockBackend, LockContext } from "./lock-backend-interface";

export class FileSystemLockBackend implements LockBackend {
	constructor(private readonly _fallbackDir: FilePath) {}

	async acquire(context: LockContext, ttlMs: number): Promise<number | null> {
		if (!this._isFsBackendAllowed()) {
			return null;
		}
		try {
			const lockFile = await this._ensureLockDir(context.lockName);
			if (await this._isLockHeld(lockFile, ttlMs)) {
				return null;
			}
			return await this._writeNewLock(lockFile, context.instanceId, ttlMs);
		} catch {
			logger.error("Filesystem lock acquire failed");
			return null;
		}
	}

	private _isFsBackendAllowed(): boolean {
		if (!isDevelopment() && getNodeEnv() !== NODE_ENV.TEST) {
			logger.error(
				"No lock backend available (MongoDB, Redis) and filesystem fallback is disabled in production"
			);
			return false;
		}
		return true;
	}

	private async _ensureLockDir(lockName: string): Promise<string> {
		await fs.mkdir(this._fallbackDir, { recursive: true });
		return path.join(this._fallbackDir, `${lockName}.lock`);
	}

	private async _isLockHeld(lockFile: string, ttlMs: number): Promise<boolean> {
		try {
			const existing = await fs.readFile(lockFile, CryptoAlg.UTF8);
			const data = JSON.parse(existing);
			return Date.now() - data.acquiredAt < ttlMs;
		} catch {
			return false;
		}
	}

	private async _writeNewLock(
		lockFile: string,
		instanceId: InstanceId,
		ttlMs: number
	): Promise<number> {
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
	}

	async release(context: LockContext, _fencingToken: number): Promise<boolean> {
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
			const content = await fs.readFile(lockFile, CryptoAlg.UTF8);
			const data = JSON.parse(content);
			if (
				data.instanceId === instanceId &&
				data.fencingToken === fencingToken
			) {
				return fencingToken;
			}
			return -1;
		} catch {
			return -1;
		}
	}
}
