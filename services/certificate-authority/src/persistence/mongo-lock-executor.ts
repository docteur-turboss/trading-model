import { logger } from "@trading-model/common/config/logger";
import type { Collection } from "mongodb";

import type { LockContext, LockDocument } from "./lock-backends";

export class MongoLockExecutor {
	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void,
	) {}

	async acquire(
		context: LockContext,
		ttlMs: number,
	): Promise<number | null> {
		const { lockName, instanceId } = context;
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
				{ upsert: true, returnDocument: "before" },
			);
			const acquired =
				result === null || (result.expiresAt && result.expiresAt < now);
			return acquired ? nextFencingToken : null;
		} catch (err) {
			logger.warn("MongoDB lock acquire failed", { context: { err } });
			this._onDisconnect();
			return null;
		}
	}

	async release(
		context: LockContext,
		fencingToken: number,
	): Promise<boolean> {
		const { lockName, instanceId } = context;
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
			this._onDisconnect();
			return false;
		}
	}

	async verifyOwnership(
		context: LockContext,
		fencingToken: number,
	): Promise<number> {
		const { lockName, instanceId } = context;
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
			this._onDisconnect();
			return -1;
		}
	}
}
