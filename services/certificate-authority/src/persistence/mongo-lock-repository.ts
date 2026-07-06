import type { Collection } from "mongodb";
import type { LockContext, LockDocument } from "./lock-backends";

export class MongoLockRepository {
	async acquire(
		collection: Collection<LockDocument>,
		context: LockContext,
		ttlMs: number
	): Promise<number | null> {
		const { lockName } = context;
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
					instanceId: context.instanceId,
					fencingToken: nextFencingToken,
				},
			},
			{ upsert: true, returnDocument: "before" }
		);
		const acquired =
			result === null || (result.expiresAt && result.expiresAt < now);
		return acquired ? nextFencingToken : null;
	}

	async release(
		collection: Collection<LockDocument>,
		context: LockContext,
		fencingToken: number
	): Promise<void> {
		const { lockName, instanceId } = context;
		await collection.deleteOne({
			name: lockName,
			instanceId,
			fencingToken,
		});
	}

	async verifyOwnership(
		collection: Collection<LockDocument>,
		context: LockContext,
		fencingToken: number
	): Promise<number> {
		const { lockName, instanceId } = context;
		const doc = await collection.findOne({ name: lockName });
		if (
			!doc ||
			doc.instanceId !== instanceId ||
			doc.fencingToken !== fencingToken
		) {
			return -1;
		}
		return fencingToken;
	}
}
