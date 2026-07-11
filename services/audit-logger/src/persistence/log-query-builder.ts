import type { LogLevel } from "@trading-model/common/config/log-types";
import type { DateRange } from "@trading-model/common/domain/date-range";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type {
	CorrelationId,
	ServiceId,
} from "@trading-model/common/domain/primitives";

type MongoDoc = Record<string, unknown>;

export interface LogQuery extends PaginationQuery {
	serviceName?: ServiceId;
	level?: LogLevel;
	correlationId?: CorrelationId;
	dateRange?: DateRange;
	search?: string;
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
		if (!dr) {
			return;
		}
		const rangeFilter: Record<string, Date | undefined> = {};
		if (dr.start) {
			rangeFilter.$gte = dr.start;
		}
		if (dr.end) {
			rangeFilter.$lte = dr.end;
		}
		filter.receivedAt = rangeFilter;
	}

	private _addSearchFilter(filter: MongoDoc, params: LogQuery): void {
		if (!params.search) {
			return;
		}
		filter.message = { $regex: params.search, $options: "i" };
	}
}
