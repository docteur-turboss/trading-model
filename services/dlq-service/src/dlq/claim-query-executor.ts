import { ObjectId } from "mongodb";

import type { BatchContext } from "./types";

export class ClaimQueryExecutor {
	async findClaimCandidates(
		col: import("mongodb").Collection,
		filter: Record<string, unknown>,
		limit: number,
		projection: Record<string, unknown>
	): Promise<import("mongodb").WithId<import("mongodb").Document>[]> {
		return await col
			.find(filter, {
				sort: { createdAt: -1 },
				limit,
				projection,
			})
			.toArray();
	}

	async executeBulkClaim(
		col: import("mongodb").Collection,
		candidates: import("mongodb").WithId<import("mongodb").Document>[],
		batchId: string,
		instanceId: string,
		claimProjection: Record<string, unknown>,
		buildBulkUpdateOps: (
			candidates: Pick<{ _id: ObjectId }, "_id">[],
			now: Date,
			instanceId: string,
			batchId: string
		) => import("mongodb").AnyBulkWriteOperation[]
	): Promise<import("mongodb").WithId<import("mongodb").Document>[]> {
		const now = new Date();
		const operations = buildBulkUpdateOps(candidates, now, instanceId, batchId);

		const bulkResult = await col.bulkWrite(operations, { ordered: false });
		if (bulkResult.modifiedCount === 0) {
			return [];
		}

		const candidateIds = candidates.map((doc) => doc._id);
		return await this.fetchClaimedByIds(
			col,
			candidateIds,
			batchId,
			claimProjection
		);
	}

	async fetchClaimedByIds(
		col: import("mongodb").Collection,
		ids: ObjectId[],
		batchId: string,
		claimProjection: Record<string, unknown>
	): Promise<import("mongodb").WithId<import("mongodb").Document>[]> {
		return await col
			.find(
				{ _id: { $in: ids }, lastBatchId: batchId },
				{ projection: claimProjection }
			)
			.toArray();
	}

	async claimByIds(
		col: import("mongodb").Collection,
		objectIds: ObjectId[],
		ctx: BatchContext,
		buildAtomicCondition: () => Record<string, unknown>
	): Promise<void> {
		const now = new Date();
		const atomicCond = buildAtomicCondition();
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
	}
}
