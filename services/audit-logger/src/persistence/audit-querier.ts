import {
	PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import { findPaginated } from "@trading-model/common/persistence/mongo-utils";
import type { Collection } from "mongodb";

import type {
	AuditEventDocument,
	AuditEventQuery,
	AuditStats,
} from "../adapters/outbound/persistence/audit-repository";
import { buildAuditEventFilter } from "./filter-builder";
import { StatsAggregator } from "./stats-aggregator";

export class AuditQuerier {
	private readonly _statsAggregator: StatsAggregator;

	constructor(private readonly _collection: Collection<AuditEventDocument>) {
		this._statsAggregator = new StatsAggregator(this._collection);
	}

	async query(
		query: AuditEventQuery
	): Promise<PaginationResult<AuditEventDocument>> {
		const { page, limit, skip } = PaginationQuery.compute(query, 100);
		const filter = buildAuditEventFilter(query);

		const [data, total] = await Promise.all([
			findPaginated(this._collection, filter, { receivedAt: -1 }, skip, limit),
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

	getStats(): Promise<AuditStats> {
		return this._statsAggregator.getStats();
	}
}
