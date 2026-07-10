import { logger } from "@trading-model/common/config/logger";
import type { Collection } from "mongodb";

import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { LockContext, LockDocument } from "./lock-backends";

export class MongoLockExecutor {
	constructor(
		private readonly _collection: () => Collection<LockDocument> | null,
		private readonly _onDisconnect: () => void
	) {}

	async acquire(context: LockContext, ttlMs: number): Promise<number | null> {
		const collection = this._collection();
		if (!collection) {
			return null;
		}
		try {
			return await this._tryAcquire(collection, context, ttlMs);
		} catch (err) {
			logger.warn("MongoDB lock acquire failed", { context: { err } });
			this._onDisconnect();
			return null;
		}
	}

	private async _tryAcquire(
		collection: Collection<LockDocument>,
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		const { lockName, instanceId } = context;
		const now = new Date();
		const expiresAt = new Date(now.getTime() + ttlMs);
		const prev = await collection.findOne({ name: lockName });
		const nextFencingToken = (prev?.fencingToken ?? 0) + 1;
		const result = await collection.findOneAndUpdate(
			_buildLockFilter(lockName, now),
			_buildLockUpdate(lockName, instanceId, now, expiresAt, nextFencingToken),
			{ upsert: true, returnDocument: "before" }
		);
		const acquired =
			result === null || (result.expiresAt && result.expiresAt < now);
		return acquired ? nextFencingToken : null;
	}

	async release(context: LockContext, fencingToken: number): Promise<boolean> {
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
		fencingToken: number
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

function _buildLockFilter(name: string, now: Date): Record<string, unknown> {
	return {
		name,
		$or: [{ expiresAt: { $lt: now } }, { expiresAt: { $exists: false } }],
	};
}

function _buildLockUpdate(
	name: string,
	instanceId: InstanceId,
	now: Date,
	expiresAt: Date,
	fencingToken: number
): Record<string, unknown> {
	return {
		$set: {
			name,
			acquiredAt: now,
			expiresAt,
			instanceId,
			fencingToken,
		},
	};
}
