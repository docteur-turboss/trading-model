import type { InstanceId } from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";
import { getCollection } from "../../config/db";
import {
	CLAIM_PROJECTION,
	RELEASE_CLAIM,
	STALE_CLAIM_MS,
} from "../../domain/dlq-constants";
import { DlqQueryBuilder } from "./dlq-query-builder";
import { toStoredDlqEntry } from "./repository";

export class ClaimReleaseManager {
	async claimEntry(
		id: string,
		ctx: import("../../shared/types").BatchContext
	): Promise<import("./repository").StoredDlqEntry | null> {
		const col = await getCollection();
		const result = await col.findOneAndUpdate(
			{
				_id: new ObjectId(id),
				...new DlqQueryBuilder().buildQueuableQuery(),
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
				projection: CLAIM_PROJECTION,
			}
		);
		if (!result) {
			return null;
		}
		return toStoredDlqEntry(result);
	}

	async releaseStaleClaims(staleThresholdMs = STALE_CLAIM_MS): Promise<number> {
		const col = await getCollection();
		const staleThreshold = new Date(Date.now() - staleThresholdMs);
		const result = await col.updateMany(
			{ processingAt: { $lt: staleThreshold } },
			RELEASE_CLAIM
		);
		return result.modifiedCount;
	}

	async releaseClaimsByInstance(instanceId: InstanceId): Promise<number> {
		const col = await getCollection();
		const result = await col.updateMany(
			{ processingInstance: instanceId },
			RELEASE_CLAIM
		);
		return result.modifiedCount;
	}

	async releaseClaimWithoutCount(id: string): Promise<void> {
		const col = await getCollection();
		await col.updateOne({ _id: new ObjectId(id) }, RELEASE_CLAIM);
	}

	async incrementRetryCount(id: string): Promise<boolean> {
		const col = await getCollection();
		const result = await col.updateOne(
			{ _id: new ObjectId(id) },
			{ $inc: { retryCount: 1 } }
		);
		return result.modifiedCount > 0;
	}
}

export const claimReleaseManager = new ClaimReleaseManager();
