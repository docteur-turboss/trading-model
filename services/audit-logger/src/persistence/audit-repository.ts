import type { AuditFilter } from "@trading-model/common/contracts/admin/audit.dto";
import type { DateRange } from "@trading-model/common/domain/date-range";
import {
	computePagination,
	type PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type { ServiceId, Topic } from "@trading-model/common/domain/primitives";
import { agentError, AppError } from "@trading-model/common/utils/errors";
import type { Collection, Db, Filter } from "mongodb";

export interface AuditEventDocument {
	receivedAt: Date;
	metadata: {
		topic: Topic;
		eventType: string;
		publisher: ServiceId;
		instanceId: string;
		messageId: string;
		correlationId?: string;
	};
	payload: unknown;
}

export interface AuditEventQuery extends PaginationQuery, AuditFilter {
	dateRange?: DateRange;
}

export interface AuditStats {
	totalEvents: number;
	eventsByTopic: Record<Topic, number>;
	eventsByPublisher: Record<ServiceId, number>;
	dateRange: {
		earliest: Date | null;
		latest: Date | null;
	};
}

const COLLECTION = "audit_events";

export class AuditRepository {
	private readonly _collection: Collection<AuditEventDocument>;

	constructor(db: Db) {
		this._collection = db.collection<AuditEventDocument>(COLLECTION);
	}

	async ensureIndexes(): Promise<void> {
		await this._collection.createIndex({ "metadata.correlationId": 1 });
		await this._collection.createIndex({
			"metadata.publisher": 1,
			receivedAt: -1,
		});
		await this._collection.createIndex({ "metadata.topic": 1, receivedAt: -1 });
		await this._collection.createIndex({ receivedAt: -1 });
	}

	async insert(event: AuditEventDocument): Promise<void> {
		try {
			await this._collection.insertOne(event);
		} catch (err) {
			throw agentError("Failed to persist audit event", {
				cause: err,
			});
		}
	}

	async insertBatch(events: AuditEventDocument[]): Promise<void> {
		if (events.length === 0) {
			return;
		}
		try {
			await this._collection.insertMany(events, { ordered: false });
		} catch (err) {
			throw agentError("Failed to persist audit event batch", {
				cause: err,
			});
		}
	}

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return await this._collection.findOne({ "metadata.messageId": messageId });
	}

	async query(
		query: AuditEventQuery
	): Promise<PaginationResult<AuditEventDocument>> {
		const { page, limit, skip } = computePagination(query, 100);

		const filter: Filter<AuditEventDocument> = {};

		if (query.topic) {
			filter["metadata.topic"] = query.topic;
		}
		if (query.publisher) {
			filter["metadata.publisher"] = query.publisher;
		}
		if (query.correlationId) {
			filter["metadata.correlationId"] = query.correlationId;
		}
		if (query.dateRange) {
			const rangeFilter: { $gte?: Date; $lte?: Date } = {};
			if (query.dateRange.start) {
				rangeFilter.$gte = query.dateRange.start;
			}
			if (query.dateRange.end) {
				rangeFilter.$lte = query.dateRange.end;
			}
			filter.receivedAt = rangeFilter;
		}

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

	async getStats(): Promise<AuditStats> {
		const [totalEvents, topicAgg, publisherAgg, dateRange] = await Promise.all([
			this._collection.estimatedDocumentCount(),
			_aggregateByField(this._collection, "topic"),
			_aggregateByField(this._collection, "publisher"),
			_aggregateDateRange(this._collection),
		]);

		return {
			totalEvents,
			eventsByTopic: _toMap(topicAgg) as Record<Topic, number>,
			eventsByPublisher: _toMap(publisherAgg) as Record<ServiceId, number>,
			dateRange: {
				earliest: dateRange[0]?.earliest ?? null,
				latest: dateRange[0]?.latest ?? null,
			},
		};
	}
}

function _aggregateByField(
	col: import("mongodb").Collection<AuditEventDocument>,
	field: string
): Promise<Array<{ _id: string } & { count: number }>> {
	return col
		.aggregate<{ _id: string; count: number }>([
			{
				$group: {
					_id: `$metadata.${field}`,
					count: { $sum: 1 },
				},
			},
		])
		.toArray();
}

function _aggregateDateRange(
	col: import("mongodb").Collection<AuditEventDocument>
): Promise<Array<{ earliest: Date | null; latest: Date | null }>> {
	return col
		.aggregate<{ earliest: Date | null; latest: Date | null }>([
			{
				$group: {
					_id: null,
					earliest: { $min: "$receivedAt" },
					latest: { $max: "$receivedAt" },
				},
			},
		])
		.toArray();
}

function _toMap(
	items: Array<{ _id: string } & { count: number }>
): Record<string, number> {
	return Object.fromEntries(items.map((item) => [item._id, item.count]));
}
