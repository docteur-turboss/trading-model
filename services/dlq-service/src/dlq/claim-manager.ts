import type { InstanceId } from "@trading-model/common/domain/primitives";
import { getCollection } from "../config/db";
import { ClaimFilterBuilder } from "./claim-filter-builder";
import { ClaimQueryExecutor } from "./claim-query-executor";
import { ClaimReleaseManager } from "./claim-release-manager";
import { CLAIM_PROJECTION } from "./dlq-constants";
import type { StoredDlqEntry } from "./repository";
import { toStoredDlqEntry } from "./repository";

export interface ClaimEntriesOptions {
	limit: number;
	batchId: string;
	instanceId: InstanceId;
	topic?: string;
}

export class DlqClaimManager {
	private readonly _filterBuilder = new ClaimFilterBuilder();
	private readonly _queryExecutor = new ClaimQueryExecutor();
	private readonly _releaseManager = new ClaimReleaseManager();

	releaseStaleClaims(staleThresholdMs?: number): Promise<number> {
		return this._releaseManager.releaseStaleClaims(staleThresholdMs);
	}

	releaseAllActiveClaims(): Promise<number> {
		return this._releaseManager.releaseAllActiveClaims();
	}

	releaseClaimsByInstance(instanceId: InstanceId): Promise<number> {
		return this._releaseManager.releaseClaimsByInstance(instanceId);
	}

	releaseClaimWithoutCount(id: string): Promise<void> {
		return this._releaseManager.releaseClaimWithoutCount(id);
	}

	incrementRetryCount(id: string): Promise<boolean> {
		return this._releaseManager.incrementRetryCount(id);
	}

	claimEntry(
		id: string,
		ctx: import("./types").BatchContext
	): Promise<StoredDlqEntry | null> {
		return this._releaseManager.claimEntry(id, ctx);
	}

	async claimEntriesForRetry(
		options: ClaimEntriesOptions
	): Promise<StoredDlqEntry[]> {
		const col = await getCollection();
		const filter = this._filterBuilder.buildClaimFilter(options.topic);
		const candidates = await this._findCandidates(col, filter, options.limit);
		if (candidates.length === 0) {
			return [];
		}

		return this._claimAndMapResults(col, candidates, options);
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

		return this._fetchAndMapResults(col, objectIds, ctx.batchId);
	}

	private _findCandidates(
		col: import("mongodb").Collection,
		filter: Record<string, unknown>,
		limit: number
	): Promise<import("mongodb").WithId<import("mongodb").Document>[]> {
		return this._queryExecutor.findClaimCandidates(
			col,
			filter,
			limit,
			CLAIM_PROJECTION
		);
	}

	private async _claimAndMapResults(
		col: import("mongodb").Collection,
		candidates: import("mongodb").WithId<import("mongodb").Document>[],
		options: ClaimEntriesOptions
	): Promise<StoredDlqEntry[]> {
		const claimed = await this._queryExecutor.executeBulkClaim(
			col,
			candidates,
			options.batchId,
			options.instanceId,
			CLAIM_PROJECTION,
			this._filterBuilder.buildBulkUpdateOps.bind(this._filterBuilder)
		);
		return claimed.map((doc) => toStoredDlqEntry(doc));
	}

	private async _fetchAndMapResults(
		col: import("mongodb").Collection,
		objectIds: import("mongodb").ObjectId[],
		batchId: string
	): Promise<StoredDlqEntry[]> {
		const claimed = await this._queryExecutor.fetchClaimedByIds(
			col,
			objectIds,
			batchId,
			CLAIM_PROJECTION
		);
		return claimed.map((doc) => toStoredDlqEntry(doc));
	}
}

export const dlqClaimManager = new DlqClaimManager();
