import type { LogLevel } from "@trading-model/common/config/log-types";
import {
	PaginationQuery,
	type PaginationResult,
} from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	DurationMs,
	Environment,
	InstanceId,
	ISODateTime,
	ServiceId,
	SessionId,
	URLString,
	UserId,
	Version,
} from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { MongoRepository } from "@trading-model/common/persistence/mongo-repository.interface";
import { findPaginated } from "@trading-model/common/persistence/mongo-utils";
import type { HttpMethod } from "@trading-model/validation/contracts/signed-request";
import type { Collection, Db } from "mongodb";
import type { DateRange } from "../types/date-range";

import { ensureLogIndexes } from "./log-index-manager";
import { buildLogQueryFilter, type LogQuery } from "./log-query-builder";
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
	level: LogLevel;
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
		statusCode?: HttpStatusCode;
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
	byLevel: Record<LogLevel, number>;
	dateRange: DateRange<ISODateTime>;
}

export class LogRepository
	implements MongoRepository<ServiceLogDocument, LogQuery>
{
	private readonly _collection: Collection<ServiceLogDocument>;
	private readonly _statsBuilder = new LogStatsBuilder();
	private _indexesEnsured = false;

	constructor(private readonly _db: Db) {
		this._collection = this._db.collection<ServiceLogDocument>("service_logs");
	}

	async ensureIndexes(): Promise<void> {
		if (this._indexesEnsured) {
			return;
		}
		this._indexesEnsured = true;
		await ensureLogIndexes(this._db);
	}

	async insert(doc: ServiceLogDocument): Promise<void> {
		await this._collection.insertOne(doc as never);
	}

	async insertBatch(docs: ServiceLogDocument[]): Promise<void> {
		if (docs.length === 0) {
			return;
		}
		await this._collection.insertMany(docs as never[], { ordered: false });
	}

	async query(params: LogQuery): Promise<PaginationResult<ServiceLogDocument>> {
		const filter = buildLogQueryFilter(params);
		const { page, limit, skip } = PaginationQuery.compute(params);
		const total = await this._collection.countDocuments(filter);
		const docs = await findPaginated(
			this._collection,
			filter,
			{ receivedAt: -1 },
			skip,
			limit
		);

		return { docs, total, page, limit };
	}

	async getStats(): Promise<LogStats> {
		const pipeline = this._statsBuilder.build();
		const [aggResult] = await this._collection.aggregate(pipeline).toArray();
		return this._statsBuilder.parseResult(aggResult);
	}

	async findById(id: string): Promise<ServiceLogDocument | null> {
		const { ObjectId } = await import("mongodb");
		if (!ObjectId.isValid(id)) {
			return null;
		}
		return this._collection.findOne({ _id: new ObjectId(id) } as never);
	}
}
