import type { InstanceId } from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";
import {
	CLAIM_PROJECTION,
	RELEASE_CLAIM,
	STALE_CLAIM_MS,
} from "../../domain/dlq-constants";
import type { BatchContext } from "../../shared/types";
import type { CollectionProvider } from "./collection-provider";
import { DlqQueryBuilder } from "./dlq-query-builder";
import type { StoredDlqEntry } from "./repository";
import { toStoredDlqEntry } from "./repository";

export class ClaimReleaseManager {
	constructor(private readonly _getCollection: CollectionProvider) {}

	async claimEntry(
		id: string,
		ctx: BatchContext
	): Promise<StoredDlqEntry | null> {
		const col = await this._getCollection();
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
		const col = await this._getCollection();
		const staleThreshold = new Date(Date.now() - staleThresholdMs);
		const result = await col.updateMany(
			{ processingAt: { $lt: staleThreshold } },
			RELEASE_CLAIM
		);
		return result.modifiedCount;
	}

	async releaseClaimsByInstance(instanceId: InstanceId): Promise<number> {
		const col = await this._getCollection();
		const result = await col.updateMany(
			{ processingInstance: instanceId },
			RELEASE_CLAIM
		);
		return result.modifiedCount;
	}

	async releaseClaimWithoutCount(id: string): Promise<void> {
		const col = await this._getCollection();
		await col.updateOne({ _id: new ObjectId(id) }, RELEASE_CLAIM);
	}

	async incrementRetryCount(id: string): Promise<boolean> {
		const col = await this._getCollection();
		const result = await col.updateOne(
			{ _id: new ObjectId(id) },
			{ $inc: { retryCount: 1 } }
		);
		return result.modifiedCount > 0;
	}
}
