import type { PaginationResult } from "../domain/pagination";

export type { DateRange } from "../domain/date-range";
export type { PaginationQuery, PaginationResult } from "../domain/pagination";

/**
 * Standard paginated response wrapper.
 * Shares `page`, `limit`, `total` semantics with PaginationResult.
 */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}

/** Converts a PaginationResult (internal) to a PaginatedResponse (API response). */
export function toPaginatedResponse<T>(
	result: PaginationResult<T>
): PaginatedResponse<T> {
	return {
		data: result.docs,
		pagination: {
			page: result.page,
			limit: result.limit,
			total: result.total,
			totalPages: Math.ceil(result.total / result.limit),
		},
	};
}
