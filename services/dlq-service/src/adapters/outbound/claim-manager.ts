import type {
	InstanceId,
	Limit,
	Topic,
} from "@trading-model/primitives/primitives";
import type { Collection, Document, ObjectId, WithId } from "mongodb";
import { CLAIM_PROJECTION } from "../../domain/dlq-constants";
import type { BatchContext } from "../../shared/types";
import type { CollectionProvider } from "./collection-provider";
import { DlqQueryBuilder } from "./dlq-query-builder";
import type { StoredDlqEntry } from "./repository";
import { toStoredDlqEntry } from "./repository";

export interface ClaimEntriesOptions {
	limit: Limit;
	batchId: string;
	instanceId: InstanceId;
	topic?: Topic;
}

export class DlqClaimManager {
	private readonly _queryBuilder = new DlqQueryBuilder();

	constructor(private readonly _getCollection: CollectionProvider) {}

	async claimEntriesForRetry(
		options: ClaimEntriesOptions
	): Promise<StoredDlqEntry[]> {
		const col = await this._getCollection();
		const candidates = await col
			.find(this._queryBuilder.buildClaimFilter(options.topic), {
				sort: { createdAt: -1 },
				limit: options.limit,
				projection: CLAIM_PROJECTION,
			})
			.toArray();
		if (candidates.length === 0) {
			return [];
		}

		const modified = await this._claim(col, candidates, options);
		if (modified === 0) {
			return [];
		}
		// Every candidate claimed: the claim changes no projected field, no re-read needed.
		const claimed =
			modified === candidates.length
				? candidates
				: await this._fetchClaimed(
						col,
						candidates.map((doc) => doc._id),
						options.batchId
					);
		return claimed.map(toStoredDlqEntry);
	}

	async claimEntriesByIds(
		ids: string[],
		ctx: BatchContext
	): Promise<StoredDlqEntry[]> {
		if (ids.length === 0) {
			return [];
		}
		const col = await this._getCollection();
		const objectIds = this._queryBuilder.toValidObjectIds(ids);
		if (objectIds.length === 0) {
			return [];
		}

		await this._claim(
			col,
			objectIds.map((_id) => ({ _id })),
			ctx
		);
		const claimed = await this._fetchClaimed(col, objectIds, ctx.batchId);
		return claimed.map(toStoredDlqEntry);
	}

	private async _claim(
		col: Collection,
		candidates: { _id: ObjectId }[],
		ctx: BatchContext
	): Promise<number> {
		const operations = this._queryBuilder.buildBulkUpdateOps(
			candidates,
			new Date(),
			ctx.instanceId,
			ctx.batchId
		);
		const result = await col.bulkWrite(operations, { ordered: false });
		return result.modifiedCount;
	}

	private _fetchClaimed(
		col: Collection,
		ids: ObjectId[],
		batchId: string
	): Promise<WithId<Document>[]> {
		return col
			.find(
				{ _id: { $in: ids }, lastBatchId: batchId },
				{ projection: CLAIM_PROJECTION }
			)
			.toArray();
	}
}
