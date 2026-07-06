import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { env } from "../config/env";
import { ClaimFilterBuilder } from "./claim-filter-builder";
import { ClaimQueryExecutor } from "./claim-query-executor";
import { DLQ_STATUS } from "./dlq-status";
import type { StoredDlqEntry } from "./repository";

export interface ClaimEntriesOptions {
	limit: number;
	batchId: string;
	instanceId: string;
	topic?: string;
}

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export class DlqClaimManager {
	private readonly _filterBuilder = new ClaimFilterBuilder();
	private readonly _queryExecutor = new ClaimQueryExecutor();

	async claimEntriesForRetry(
		options: ClaimEntriesOptions
	): Promise<StoredDlqEntry[]> {
		const { limit, batchId, instanceId, topic } = options;
		const col = await getCollection();
		const filter = this._filterBuilder.buildClaimFilter(topic);

		const candidates = await this._queryExecutor.findClaimCandidates(
			col,
			filter,
			limit,
			this._claimProjection
		);
		if (candidates.length === 0) {
			return [];
		}

		const claimed = await this._queryExecutor.executeBulkClaim(
			col,
			candidates,
			batchId,
			instanceId,
			this._claimProjection,
			this._filterBuilder.buildBulkUpdateOps.bind(this._filterBuilder)
		);

		return claimed.map((doc) => this._filterBuilder.toStoredDlqEntry(doc));
	}

	async claimEntriesByIds(
		ids: string[],
		ctx: import("./types").BatchContext
	): Promise<StoredDlqEntry[]> {
		if (ids.length === 0) {
			return [];
		}
		const col = await getCollection();
		const objectIds = this._filterBuilder.toValidObjectIds(ids);
		if (objectIds.length === 0) {
			return [];
		}

		await this._queryExecutor.claimByIds(col, objectIds, ctx, () =>
			this._filterBuilder.buildAtomicCondition()
		);

		const claimed = await this._queryExecutor.fetchClaimedByIds(
			col,
			objectIds,
			ctx.batchId,
			this._claimProjection
		);
		return claimed.map((doc) => this._filterBuilder.toStoredDlqEntry(doc));
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
				status: { $nin: [DLQ_STATUS.COMPLETED, DLQ_STATUS.ABANDONED] },
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
				projection: this._claimProjection,
			}
		);
		if (!result) {
			return null;
		}
		return this._filterBuilder.toStoredDlqEntry(result);
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

	private readonly _claimProjection = {
		_id: 1,
		topic: 1,
		message: 1,
		reason: 1,
		deliveryAttempt: 1,
		createdAt: 1,
	} as const;
}

export const dlqClaimManager = new DlqClaimManager();
