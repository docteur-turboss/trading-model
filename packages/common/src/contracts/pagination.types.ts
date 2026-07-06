/** Query parameters for paginated list endpoints. */
export interface PaginationQuery {
	page?: number;
	limit?: number;
	offset?: number;
}

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
