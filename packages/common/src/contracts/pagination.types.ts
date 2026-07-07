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
