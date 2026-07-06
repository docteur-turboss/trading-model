/** Query parameters for paginated list endpoints. */
export interface PaginationQuery {
	page?: number;
	limit?: number;
}

/** Standard paginated result envelope. */
export interface PaginationResult<T> {
	docs: T[];
	total: number;
	page: number;
	limit: number;
}
