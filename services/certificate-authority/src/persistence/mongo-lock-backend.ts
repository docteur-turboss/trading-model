import { logger } from "@trading-model/common/config/logger";
import type { Collection } from "mongodb";
import type { LockBackend, LockDocument } from "./lock-backends";

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
