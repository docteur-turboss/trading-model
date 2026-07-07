import {
	computePagination,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type { Collection } from "mongodb";

import type {
	AuditEventDocument,
	AuditEventQuery,
	AuditStats,
} from "./audit-repository";
import { FilterBuilder } from "./filter-builder";
import { StatsAggregator } from "./stats-aggregator";

export class AuditQuerier {
	private readonly _filterBuilder: FilterBuilder;
	private readonly _statsAggregator: StatsAggregator;

	constructor(private readonly _collection: Collection<AuditEventDocument>) {
		this._filterBuilder = new FilterBuilder();
		this._statsAggregator = new StatsAggregator(this._collection);
	}

	async query(
		query: AuditEventQuery
	): Promise<PaginationResult<AuditEventDocument>> {
		const { page, limit, skip } = computePagination(query, 100);
		const filter = this._filterBuilder.build(query);

		const [data, total] = await Promise.all([
			this._collection
				.find(filter)
				.sort({ receivedAt: -1 })
				.skip(skip)
				.limit(limit)
				.toArray(),
			this._collection.countDocuments(filter),
		]);

		return {
			docs: data,
			total,
			page,
			limit,
		};
	}

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return await this._collection.findOne({ "metadata.messageId": messageId });
	}

	async getStats(): Promise<AuditStats> {
		return this._statsAggregator.getStats();
	}
}
