export interface PaginationQuery {
	page?: number;
	limit?: number;
}

export interface OffsetPagination {
	limit?: number;
	offset?: number;
}

export interface PaginationResult<_TValue> {
	docs: T[];
	total: number;
	page: number;
	limit: number;
}

export interface ComputedPagination {
	page: number;
	limit: number;
	skip: number;
}

const DEFAULT_MAX_LIMIT = 1000;

export function computePagination(
	query: PaginationQuery,
	defaultLimit = 50,
	maxLimit = DEFAULT_MAX_LIMIT
): ComputedPagination {
	const page = Math.max(1, query.page ?? 1);
	const limit = Math.min(maxLimit, query.limit ?? defaultLimit);
	const skip = (page - 1) * limit;
	return { page, limit, skip };
}
