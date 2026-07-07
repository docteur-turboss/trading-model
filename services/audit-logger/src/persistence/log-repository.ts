import type { HttpMethod } from "@trading-model/common/contracts/signed-request";
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
import type { Collection, Db } from "mongodb";

import { LogIndexManager } from "./log-index-manager";
import { type LogQuery, LogQueryBuilder } from "./log-query-builder";
import { LogStatsBuilder } from "./log-stats-builder";

export type { LogQuery } from "./log-query-builder";

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

export interface LogStats {
	total: number;
	byService: Record<ServiceId, number>;
	byLevel: Record<string, number>;
	dateRange: { earliest?: string; latest?: string };
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
