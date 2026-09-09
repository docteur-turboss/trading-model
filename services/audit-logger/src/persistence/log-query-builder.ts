import type { LogLevel } from "@trading-model/common/config/log-types";
import type { QueryEnvelope } from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { buildDateRangeFilter } from "./date-range-filter";

type MongoDoc = Record<string, unknown>;

export interface LogQuery extends QueryEnvelope {
	serviceName?: ServiceId;
	level?: LogLevel;
	correlationId?: CorrelationId;
	search?: string;
}

export function buildLogQueryFilter(params: LogQuery): MongoDoc {
	const filter: MongoDoc = {};
	if (params.serviceName) {
		filter["service.name"] = params.serviceName;
	}
	if (params.level) {
		filter.level = params.level;
	}
	if (params.correlationId) {
		filter.correlationId = params.correlationId;
	}
	if (params.dateRange) {
		filter.receivedAt = buildDateRangeFilter(params.dateRange);
	}
	if (params.search) {
		filter.message = { $regex: params.search, $options: "i" };
	}
	return filter;
}
