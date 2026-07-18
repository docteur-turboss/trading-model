import type { LogLevel } from "@trading-model/common/config/log-types";
import type { QueryEnvelope } from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { MongoFilterBuilder } from "./mongo-filter-builder";

type MongoDoc = Record<string, unknown>;

export interface LogQuery extends QueryEnvelope {
	serviceName?: ServiceId;
	level?: LogLevel;
	correlationId?: CorrelationId;
	search?: string;
}

export class LogQueryBuilder extends MongoFilterBuilder<LogQuery> {
	build(params: LogQuery): MongoDoc {
		return this.buildFilter(params);
	}

	buildFilter(params: LogQuery): MongoDoc {
		const filter: MongoDoc = {};

		this._addIfPresent(filter, "service.name", params.serviceName);
		this._addIfPresent(filter, "level", params.level);
		this._addIfPresent(filter, "correlationId", params.correlationId);
		this._addDateRangeFilter(filter, params.dateRange, "receivedAt");
		this._addSearchFilter(filter, params);

		return filter;
	}

	private _addSearchFilter(filter: MongoDoc, params: LogQuery): void {
		if (!params.search) {
			return;
		}
		filter.message = { $regex: params.search, $options: "i" };
	}
}
