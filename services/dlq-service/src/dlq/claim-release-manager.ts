import { ObjectId } from "mongodb";

import { getCollection } from "../config/db";
import { ENV } from "../config/env";
import { ClaimFilterBuilder } from "./claim-filter-builder";
import { DLQ_STATUS } from "./dlq-status";

const DLQ_MAX_CONSECUTIVE_ERRORS = 3;

export class ClaimReleaseManager {
	private readonly _filterBuilder = new ClaimFilterBuilder();

	async claimEntry(
		id: string,
		ctx: import("./types").BatchContext
	): Promise<import("./repository").StoredDlqEntry | null> {
		const col = await getCollection();
		const result = await col.findOneAndUpdate(
			{
				_id: new ObjectId(id),
				retryCount: { $lt: ENV.DLQ_RETRY_MAX_ATTEMPTS },
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
