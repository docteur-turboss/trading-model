import {
	type AnyBulkWriteOperation,
	type Document,
	ObjectId,
	type WithId,
} from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";
import type { StoredDlqEntry } from "./repository";

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export interface ClaimEntriesOptions {
	limit: number;
	batchId: string;
	instanceId: string;
	topic?: string;
}

interface BulkUpdateOptions {
	candidates: Pick<{ _id: ObjectId }, "_id">[];
	now: Date;
	instanceId: string;
	batchId: string;
}

export class DlqClaimManager {
	async claimEntriesForRetry(
		options: ClaimEntriesOptions
	): Promise<StoredDlqEntry[]> {
		const { limit, batchId, instanceId, topic } = options;
		const col = await getCollection();
		const filter = this._buildClaimFilter(topic);

		const candidates = await col
			.find(filter, {
				sort: { createdAt: -1 },
				limit,
				projection: {
					_id: 1,
					topic: 1,
					message: 1,
					reason: 1,
					deliveryAttempt: 1,
					createdAt: 1,
				},
			})
			.toArray();

		if (candidates.length === 0) {
			return [];
		}

		const now = new Date();
		const operations = this._buildBulkUpdateOps({
			candidates,
			now,
			instanceId,
			batchId,
		});

		const bulkResult = await col.bulkWrite(operations, { ordered: false });
		if (bulkResult.modifiedCount === 0) {
			return [];
		}

		const candidateIds = candidates.map((doc) => doc._id);
		const claimedDocs = await col
			.find(
				{ _id: { $in: candidateIds }, lastBatchId: batchId },
				{
					projection: {
						_id: 1,
						topic: 1,
						message: 1,
						reason: 1,
						deliveryAttempt: 1,
						createdAt: 1,
					},
				}
			)
			.toArray();

		return claimedDocs.map((doc) => this._toStoredDlqEntry(doc));
	}

	async claimEntriesByIds(
		ids: string[],
		ctx: import("./types").BatchContext
	): Promise<StoredDlqEntry[]> {
		if (ids.length === 0) {
			return [];
		}
		const col = await getCollection();
		const objectIds = ids
			.filter((id) => ObjectId.isValid(id))
			.map((id) => new ObjectId(id));
		if (objectIds.length === 0) {
			return [];
		}

		const now = new Date();
		const atomicCond = this._buildAtomicCondition();

		const operations = objectIds.map((id) => ({
			updateOne: {
				filter: { _id: id, ...atomicCond },
				update: {
					$set: {
						processingAt: now,
						processingInstance: ctx.instanceId,
						lastBatchId: ctx.batchId,
					},
				},
			},
		}));

		await col.bulkWrite(operations, { ordered: false });

		const claimed = await col
			.find(
				{ _id: { $in: objectIds }, lastBatchId: ctx.batchId },
				{
					projection: {
						_id: 1,
						topic: 1,
						message: 1,
						reason: 1,
						deliveryAttempt: 1,
						createdAt: 1,
					},
				}
			)
			.toArray();

		return claimed.map((doc) => this._toStoredDlqEntry(doc));
	}

	async claimEntry(
		id: string,
		ctx: import("./types").BatchContext
	): Promise<StoredDlqEntry | null> {
		const col = await getCollection();
		const result = await col.findOneAndUpdate(
			{
				_id: new ObjectId(id),
				retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
				processingAt: { $exists: false },
				status: { $nin: ["completed", "abandoned"] },
				consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
			},
			{
				$set: {
					processingAt: new Date(),
					processingInstance: ctx.instanceId,
					lastBatchId: ctx.batchId,
				},
			},
			{
				returnDocument: "after",
				projection: {
					_id: 1,
					topic: 1,
					message: 1,
					reason: 1,
					deliveryAttempt: 1,
					createdAt: 1,
				},
			}
		);
		if (!result) {
			return null;
		}
		return this._toStoredDlqEntry(result);
	}

	async releaseStaleClaims(staleThresholdMs = 60_000): Promise<number> {
		const col = await getCollection();
		const staleThreshold = new Date(Date.now() - staleThresholdMs);
		const result = await col.updateMany(
			{ processingAt: { $lt: staleThreshold } },
			{ $unset: { processingAt: "", processingInstance: "" } }
		);
		return result.modifiedCount;
	}

	async releaseAllActiveClaims(): Promise<number> {
		const col = await getCollection();
		const result = await col.updateMany(
			{ processingAt: { $exists: true } },
			{ $unset: { processingAt: "", processingInstance: "" } }
		);
		return result.modifiedCount;
	}

	async releaseClaimsByInstance(instanceId: string): Promise<number> {
		const col = await getCollection();
		const result = await col.updateMany(
			{ processingInstance: instanceId },
			{ $unset: { processingAt: "", processingInstance: "" } }
		);
		return result.modifiedCount;
	}

	async releaseClaimWithoutCount(id: string): Promise<void> {
		const col = await getCollection();
		await col.updateOne(
			{ _id: new ObjectId(id) },
			{ $unset: { processingAt: "", processingInstance: "" } }
		);
	}

	async incrementRetryCount(id: string): Promise<boolean> {
		const col = await getCollection();
		const result = await col.updateOne(
			{ _id: new ObjectId(id) },
			{ $inc: { retryCount: 1 } }
		);
		return result.modifiedCount > 0;
	}

	private _toStoredDlqEntry(doc: WithId<Document>): StoredDlqEntry {
		return {
			id: doc._id.toHexString(),
			topic: (doc.topic as string | null) ?? null,
			message: doc.message,
			reason: (doc.reason as string | null) ?? null,
			deliveryAttempt: doc.deliveryAttempt as number,
			createdAt:
				(doc.createdAt as Date | undefined)?.toISOString() ??
				new Date().toISOString(),
		};
	}

	private _buildClaimFilter(topic?: string): Record<string, unknown> {
		const statusFilter: Record<string, unknown> = {
			$nin: ["completed", "abandoned"],
		};
		const filter: Record<string, unknown> = {
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: statusFilter,
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
		if (topic) {
			filter.topic = topic;
		}
		return filter;
	}

	private _buildAtomicCondition(): Record<string, unknown> {
		return {
			retryCount: { $lt: env.DLQ_RETRY_MAX_ATTEMPTS },
			processingAt: { $exists: false },
			status: { $nin: ["completed", "abandoned"] },
			consecutiveErrors: { $lt: DLQ_MAX_CONSECUTIVE_ERRORS },
		};
	}

	private _buildBulkUpdateOps(
		options: BulkUpdateOptions
	): AnyBulkWriteOperation[] {
		const { candidates, now, instanceId, batchId } = options;
		const atomicCond = this._buildAtomicCondition();
		return candidates.map((doc) => ({
			updateOne: {
				filter: { _id: doc._id, ...atomicCond },
				update: {
					$set: {
						processingAt: now,
						processingInstance: instanceId,
						lastBatchId: batchId,
					},
				},
			},
		}));
	}
}

export const dlqClaimManager = new DlqClaimManager();
