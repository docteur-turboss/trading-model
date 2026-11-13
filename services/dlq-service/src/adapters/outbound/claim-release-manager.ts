import type { InstanceId } from "@trading-model/primitives/primitives";
import { ObjectId } from "mongodb";
import { RELEASE_CLAIM, STALE_CLAIM_MS } from "../../domain/dlq-constants";
import type { CollectionProvider } from "./collection-provider";

export class ClaimReleaseManager {
	constructor(private readonly _getCollection: CollectionProvider) {}

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
