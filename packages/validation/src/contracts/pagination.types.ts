import type { PaginationResult } from "@trading-model/common/domain/pagination";
import type {
	Limit,
	PageNumber,
	PositiveInt,
} from "@trading-model/common/domain/primitives";

export type { DateRange } from "@trading-model/common/domain/date-range";
export type {
	PaginationQuery,
	PaginationResult,
} from "@trading-model/common/domain/pagination";

/** Shared pagination metadata embedded in API responses. */
export interface PaginationInfo {
	page: PageNumber;
	limit: Limit;
	total: number;
	totalPages: PositiveInt;
}

/**
 * Standard paginated response wrapper.
 * Shares `page`, `limit`, `total` semantics with PaginationResult.
 */
export interface PaginatedResponse<_TValue> {
	data: _TValue[];
	pagination: PaginationInfo;
}

/** Converts a PaginationResult (internal) to a PaginatedResponse (API response). */
export function toPaginatedResponse<TValue>(
	result: PaginationResult<TValue>
): PaginatedResponse<TValue> {
	return {
		data: result.docs,
		pagination: {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: Math.ceil(result.total / result.limit) as PositiveInt,
		},
	};
}
