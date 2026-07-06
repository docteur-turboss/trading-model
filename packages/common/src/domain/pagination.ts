export interface PaginationQuery {
	page?: number;
	limit?: number;
}

export interface PaginationResult<T> {
	docs: T[];
	total: number;
	page: number;
	limit: number;
}
