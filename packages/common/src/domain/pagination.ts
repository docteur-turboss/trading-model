import type { Limit, PageNumber } from "./primitives";
import { toLimit, toPageNumber } from "./primitives/page-number";

export interface PaginationQuery {
	page?: PageNumber;
	limit?: Limit;
}

export interface PaginationResult<_TValue> {
	docs: _TValue[];
	total: number;
	page: PageNumber;
	limit: Limit;
}

export interface ComputedPagination {
	page: PageNumber;
	limit: Limit;
	skip: number;
}

const DEFAULT_MAX_LIMIT = 1000;

export function computePagination(
	query: PaginationQuery,
	defaultLimit = 50,
	maxLimit = DEFAULT_MAX_LIMIT
): ComputedPagination {
	const page = toPageNumber(query.page ?? 1);
	const limit = toLimit(query.limit ?? defaultLimit, maxLimit);
	const skip = (page - 1) * limit;
	return { page, limit, skip };
}
