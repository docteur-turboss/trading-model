export type { PaginationQuery } from "../domain/pagination";

export type { DateRange } from "../domain/date-range";

/** Standard paginated response wrapper. */
export interface PaginatedResponse<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
		totalPages: number;
	};
}
