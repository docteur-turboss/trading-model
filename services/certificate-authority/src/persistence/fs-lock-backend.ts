import fs from "node:fs/promises";
import path from "node:path";
import { logger } from "@trading-model/common/config/logger";
import type { LockBackend } from "./lock-backends";

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

	verifyOwnership(
		_lockName: string,
		_instanceId: string,
		_fencingToken: number
	): Promise<number> {
		return Promise.resolve(-1);
	}
}
