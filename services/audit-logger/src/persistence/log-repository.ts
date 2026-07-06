import type { DateRange } from "@trading-model/common/domain/date-range";
import {
	computePagination,
	type PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { Collection, Db } from "mongodb";

type MongoDoc = Record<string, unknown>;

export interface ServiceLogDocument {
	receivedAt: Date;
	ttl: Date;
	level: "debug" | "info" | "warn" | "error";
	message: string;
	service: {
		name: ServiceId;
		instanceId: string;
		version?: string;
	};
	module?: string;
	correlationId?: string;
	context?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
		code?: string;
	};
	request?: {
		method?: string;
		url?: string;
		statusCode?: number;
		durationMs?: number;
	};
	user?: {
		id?: string;
		sessionId?: string;
	};
	environment?: string;
}

export interface LogQuery extends PaginationQuery {
	serviceName?: ServiceId;
	level?: string;
	correlationId?: string;
	dateRange?: DateRange;
	search?: string;
}

export interface LogStats {
	total: number;
	byService: Record<ServiceId, number>;
	byLevel: Record<string, number>;
	dateRange: { earliest?: string; latest?: string };
}

export class LogRepository {
	private _collection?: Collection<ServiceLogDocument>;

	constructor(private readonly _db: Db) {}

	private async _getCollection(): Promise<Collection<ServiceLogDocument>> {
		if (!this._collection) {
			this._collection =
				this._db.collection<ServiceLogDocument>("service_logs");
			await this.ensureIndexes();
		}
		return this._collection;
	}

	async ensureIndexes(): Promise<void> {
		const col = await this._getCollection();

		if (await this._indexExists("ttl_1")) {
			return;
		}

		await col.createIndex({ ttl: 1 }, { expireAfterSeconds: 0 });
		await col.createIndex({ "service.name": 1, receivedAt: -1 });
		await col.createIndex({ level: 1, receivedAt: -1 });
		await col.createIndex({ correlationId: 1 });
		await col.createIndex({ receivedAt: -1 });
	}

	async insert(doc: ServiceLogDocument): Promise<void> {
		const col = await this._getCollection();
		await col.insertOne(doc as never);
	}

	async insertBatch(docs: ServiceLogDocument[]): Promise<void> {
		if (docs.length === 0) {
			return;
		}
		const col = await this._getCollection();
		await col.insertMany(docs as never[], { ordered: false });
	}

	async query(params: LogQuery): Promise<PaginationResult<ServiceLogDocument>> {
		const col = await this._getCollection();
		const filter = this._buildLogFilter(params);

		const { page, limit, skip } = computePagination(params);
		const total = await col.countDocuments(filter);
		const docs = await col
			.find(filter)
			.sort({ receivedAt: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return { docs, total, page, limit };
	}

	async getStats(): Promise<LogStats> {
		const col = await this._getCollection();
		const pipeline = this._buildStatsPipeline();
		const [aggResult] = await col.aggregate(pipeline).toArray();
		return this._parseStatsResult(aggResult);
	}

	async getById(id: string): Promise<ServiceLogDocument | null> {
		const col = await this._getCollection();
		const { ObjectId } = await import("mongodb");
		if (!ObjectId.isValid(id)) {
			return null;
		}
		return col.findOne({ _id: new ObjectId(id) } as never);
	}

	private _buildLogFilter(params: LogQuery): MongoDoc {
		const filter: MongoDoc = {};

		_addIfPresent(filter, "service.name", params.serviceName);
		_addIfPresent(filter, "level", params.level);
		_addIfPresent(filter, "correlationId", params.correlationId);
		_addDateRangeFilter(filter, params);
		_addSearchFilter(filter, params);

		return filter;
	}

	private _buildStatsPipeline(): MongoDoc[] {
		return [
			{
				$facet: {
					byService: [
						{ $group: { _id: "$service.name", count: { $sum: 1 } } },
					],
					byLevel: [{ $group: { _id: "$level", count: { $sum: 1 } } }],
					dateRange: [
						{
							$group: {
								_id: null,
								earliest: { $min: "$receivedAt" },
								latest: { $max: "$receivedAt" },
							},
						},
					],
					total: [{ $count: "count" }],
				},
			},
		];
	}

	private _parseStatsResult(aggResult: Record<string, unknown>): LogStats {
		return {
			total: _extractTotal(aggResult),
			byService: _extractMap(aggResult, "byService") as Record<ServiceId, number>,
			byLevel: _extractMap(aggResult, "byLevel"),
			dateRange: _extractDateRange(aggResult),
		};
	}
}

function _addIfPresent(
	filter: MongoDoc,
	key: string,
	value: string | undefined
): void {
	if (value) {
		filter[key] = value;
	}
}

function _addDateRangeFilter(
	filter: MongoDoc,
	params: LogQuery
): void {
	const dr = params.dateRange;
	if (!dr) {
		return;
	}
	const rangeFilter: { $gte?: Date; $lte?: Date } = {};
	if (dr.start) {
		rangeFilter.$gte = dr.start;
	}
	if (dr.end) {
		rangeFilter.$lte = dr.end;
	}
	filter.receivedAt = rangeFilter;
}

function _addSearchFilter(
	filter: MongoDoc,
	params: LogQuery
): void {
	if (!params.search) {
		return;
	}
	filter.message = { $regex: params.search, $options: "i" };
}

function _extractTotal(aggResult: Record<string, unknown>): number {
	return (aggResult?.total as Array<{ count: number }>)?.[0]?.count ?? 0;
}

function _extractMap(
	aggResult: Record<string, unknown>,
	key: string
): Record<string, number> {
	const result: Record<string, number> = {};
	for (const item of (aggResult?.[key] as Array<{
		_id: string;
		count: number;
	}>) ?? []) {
		result[item._id] = item.count;
	}
	return result;
}

function _extractDateRange(aggResult: Record<string, unknown>): {
	earliest?: string;
	latest?: string;
} {
	const dr = (
		aggResult?.dateRange as Array<{ earliest?: Date; latest?: Date }>
	)?.[0];
	return {
		earliest: dr?.earliest?.toISOString(),
		latest: dr?.latest?.toISOString(),
	};
}
