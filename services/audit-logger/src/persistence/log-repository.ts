import type { DateRange } from "@trading-model/common/domain/date-range";
import {
	computePagination,
	type PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	DurationMs,
	Environment,
	InstanceId,
	ServiceId,
	SessionId,
	URLString,
	UserId,
	Version,
} from "@trading-model/common/domain/primitives";
import { HttpMethod } from "@trading-model/common/contracts/signed-request";
import type { Collection, Db } from "mongodb";

import { LogIndexManager } from "./log-index-manager";
import { LogStatsBuilder } from "./log-stats-builder";

type MongoDoc = Record<string, unknown>;

export interface ServiceInfo {
	name: ServiceId;
	instanceId: InstanceId;
	version?: Version;
}

export interface ServiceLogDocument {
	receivedAt: Date;
	ttl: Date;
	level: "debug" | "info" | "warn" | "error";
	message: string;
	service: ServiceInfo;
	module?: string;
	correlationId?: CorrelationId;
	context?: Record<string, unknown>;
	error?: {
		name: string;
		message: string;
		stack?: string;
		code?: string;
	};
	request?: {
		method?: HttpMethod;
		url?: URLString;
		statusCode?: number;
		durationMs?: DurationMs;
	};
	user?: {
		id?: UserId;
		sessionId?: SessionId;
	};
	environment?: Environment;
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

export class LogQueryBuilder {
	build(params: LogQuery): MongoDoc {
		return this.buildFilter(params);
	}

	buildFilter(params: LogQuery): MongoDoc {
		const filter: MongoDoc = {};

		this._addIfPresent(filter, "service.name", params.serviceName);
		this._addIfPresent(filter, "level", params.level);
		this._addIfPresent(filter, "correlationId", params.correlationId);
		this._addDateRangeFilter(filter, params);
		this._addSearchFilter(filter, params);

		return filter;
	}

	private _addIfPresent(
		filter: MongoDoc,
		key: string,
		value: string | undefined
	): void {
		if (value) {
			filter[key] = value;
		}
	}

	private _addDateRangeFilter(filter: MongoDoc, params: LogQuery): void {
		const dr = params.dateRange;
		if (!dr) return;
		const rangeFilter: { $gte?: Date; $lte?: Date } = {};
		if (dr.start) rangeFilter.$gte = dr.start;
		if (dr.end) rangeFilter.$lte = dr.end;
		filter.receivedAt = rangeFilter;
	}

	private _addSearchFilter(filter: MongoDoc, params: LogQuery): void {
		if (!params.search) return;
		filter.message = { $regex: params.search, $options: "i" };
	}
}

export class LogRepository {
	private readonly _collection: Collection<ServiceLogDocument>;
	private readonly _statsBuilder = new LogStatsBuilder();
	private readonly _queryBuilder = new LogQueryBuilder();
	private readonly _indexManager: LogIndexManager;

	constructor(private readonly _db: Db) {
		this._collection = this._db.collection<ServiceLogDocument>("service_logs");
		this._indexManager = new LogIndexManager(this._db);
	}

	async ensureIndexes(): Promise<void> {
		await this._indexManager.ensure();
	}

	async insert(doc: ServiceLogDocument): Promise<void> {
		await this._collection.insertOne(doc as never);
	}

	async insertBatch(docs: ServiceLogDocument[]): Promise<void> {
		if (docs.length === 0) return;
		await this._collection.insertMany(docs as never[], { ordered: false });
	}

	async query(params: LogQuery): Promise<PaginationResult<ServiceLogDocument>> {
		const filter = this._queryBuilder.build(params);
		const { page, limit, skip } = computePagination(params);
		const total = await this._collection.countDocuments(filter);
		const docs = await this._collection
			.find(filter)
			.sort({ receivedAt: -1 })
			.skip(skip)
			.limit(limit)
			.toArray();

		return { docs, total, page, limit };
	}

	async getStats(): Promise<LogStats> {
		const pipeline = this._statsBuilder.build();
		const [aggResult] = await this._collection.aggregate(pipeline).toArray();
		return this._statsBuilder.parseResult(aggResult);
	}

	async findById(id: string): Promise<ServiceLogDocument | null> {
		const { ObjectId } = await import("mongodb");
		if (!ObjectId.isValid(id)) return null;
		return this._collection.findOne({ _id: new ObjectId(id) } as never);
	}
}
