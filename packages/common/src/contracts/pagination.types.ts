/** Query parameters for paginated list endpoints. */
export interface PaginationQuery {
	page?: number;
	limit?: number;
	offset?: number;
}

/** Date range filter for time-series queries. */
export interface DateRange {
	start?: Date;
	end?: Date;
}

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
