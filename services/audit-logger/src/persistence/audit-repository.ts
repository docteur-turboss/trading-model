import { AppError, ErrorCodes } from "@trading-model/common/utils/errors";
import type { Collection, Db, Filter } from "mongodb";

export interface AuditEventDocument {
	receivedAt: Date;
	metadata: {
		topic: string;
		eventType: string;
		publisher: string;
		instanceId: string;
		messageId: string;
		correlationId?: string;
	};
	payload: unknown;
}

export interface AuditEventQuery {
	topic?: string;
	publisher?: string;
	correlationId?: string;
	startDate?: Date;
	endDate?: Date;
	page?: number;
	limit?: number;
}

export interface PaginatedResult<TData> {
	data: TData[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

export interface AuditStats {
	totalEvents: number;
	eventsByTopic: Record<string, number>;
	eventsByPublisher: Record<string, number>;
	dateRange: {
		earliest: Date | null;
		latest: Date | null;
	};
}

const MGROUP = "$group";
const MSUM = "$sum";
const MMIN = "$min";
const MMAX = "$max";
const MID = "_id";
const MGTE = "$gte";
const MLTE = "$lte";

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
			throw new AppError(
				"Failed to persist audit event",
				ErrorCodes.AGENT_ERROR,
				{
					cause: err,
				}
			);
		}
	}

	async insertBatch(events: AuditEventDocument[]): Promise<void> {
		if (events.length === 0) {
			return;
		}
		try {
			await this._collection.insertMany(events, { ordered: false });
		} catch (err) {
			throw new AppError(
				"Failed to persist audit event batch",
				ErrorCodes.AGENT_ERROR,
				{
					cause: err,
				}
			);
		}
	}

	async findById(messageId: string): Promise<AuditEventDocument | null> {
		return await this._collection.findOne({ "metadata.messageId": messageId });
	}

	async query(
		query: AuditEventQuery
	): Promise<PaginatedResult<AuditEventDocument>> {
		const page = query.page ?? 1;
		const limit = Math.min(query.limit ?? 100, 1000);
		const skip = (page - 1) * limit;

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
		if (query.startDate || query.endDate) {
			filter.receivedAt = {};
			if (query.startDate) {
				filter.receivedAt[MGTE] = query.startDate;
			}
			if (query.endDate) {
				filter.receivedAt[MLTE] = query.endDate;
			}
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
			data,
			pagination: {
				page,
				limit,
				total,
				totalPages: Math.ceil(total / limit),
			},
		};
	}

	async getStats(): Promise<AuditStats> {
		const [totalEvents, topicAgg, publisherAgg, dateRange] = await Promise.all([
			this._collection.estimatedDocumentCount(),
			this._collection
				.aggregate<{
					_id: string;
					count: number;
				}>([{ [MGROUP]: { [MID]: "$metadata.topic", count: { [MSUM]: 1 } } }])
				.toArray(),
			this._collection
				.aggregate<{
					_id: string;
					count: number;
				}>([
					{ [MGROUP]: { [MID]: "$metadata.publisher", count: { [MSUM]: 1 } } },
				])
				.toArray(),
			this._collection
				.aggregate<{ earliest: Date | null; latest: Date | null }>([
					{
						[MGROUP]: {
							[MID]: null,
							earliest: { [MMIN]: "$receivedAt" },
							latest: { [MMAX]: "$receivedAt" },
						},
					},
				])
				.toArray(),
		]);

		return {
			totalEvents,
			eventsByTopic: Object.fromEntries(
				topicAgg.map((topic) => [topic[MID], topic.count])
			),
			eventsByPublisher: Object.fromEntries(
				publisherAgg.map((publisher) => [publisher[MID], publisher.count])
			),
			dateRange: {
				earliest: dateRange[0]?.earliest ?? null,
				latest: dateRange[0]?.latest ?? null,
			},
		};
	}
}
