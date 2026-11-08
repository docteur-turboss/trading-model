import { findPaginated } from "@trading-model/persistence/mongo-utils";
import {
	PaginationQuery,
	type PaginationResult,
} from "@trading-model/primitives/pagination";
import type { Collection } from "mongodb";

import type {
	AuditEventDocument,
	AuditEventQuery,
	AuditStats,
} from "./audit-repository";
import { buildAuditEventFilter } from "./filter-builder";
import { StatsAggregator } from "./stats-aggregator";

/** A page; `total` is absent when the caller asked for `withTotal=false`. */
export type AuditPage = Omit<PaginationResult<AuditEventDocument>, "total"> & {
	total?: number;
};

export class AuditQuerier {
	private readonly _statsAggregator: StatsAggregator;

	constructor(private readonly _collection: Collection<AuditEventDocument>) {
		this._statsAggregator = new StatsAggregator(this._collection);
	}

	async query(query: AuditEventQuery): Promise<AuditPage> {
		const { page, limit, skip } = PaginationQuery.compute(query, 100);
		const filter = buildAuditEventFilter(query);

		const [data, total] = await Promise.all([
			findPaginated(this._collection, filter, { receivedAt: -1 }, skip, limit),
			// withTotal=false: no count at all (O(n) on a broad filter).
			// No filter: the collection counter, not a scan (estimate, exact once TTL settles).
			query.withTotal === false
				? undefined
				: Object.keys(filter).length === 0
					? this._collection.estimatedDocumentCount()
					: this._collection.countDocuments(filter),
		]);

		return {
			docs: data,
			...(total === undefined ? {} : { total }),
			page,
			limit,
		};
	}

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return await this._collection.findOne({ "metadata.messageId": messageId });
	}

	/** Starts the first per-topic / per-publisher pass in the background. */
	warmStats(): void {
		this._statsAggregator.warm();
	}

	getStats(): Promise<AuditStats> {
		return this._statsAggregator.getStats();
	}
}
