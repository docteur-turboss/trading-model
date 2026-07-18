import type { DateRange } from "./date-range";
import type { Limit, PageNumber } from "./primitives";
import { toLimit, toPageNumber } from "./primitives/page-number";

export interface PaginationQuery {
	page?: PageNumber;
	limit?: Limit;
}

const DEFAULT_MAX_LIMIT = 1000;

export namespace PaginationQuery {
	export function compute(
		query: PaginationQuery,
		defaultLimit = 50,
		maxLimit = DEFAULT_MAX_LIMIT
	): ComputedPagination {
		const page = toPageNumber(query.page ?? 1);
		const limit = toLimit(query.limit ?? defaultLimit, maxLimit);
		const skip = (page - 1) * limit;
		return { page, limit, skip };
	}
}

/** Common pattern: pagination + optional date range. Used by audit queries and log queries. */
export interface QueryEnvelope extends PaginationQuery {
	dateRange?: DateRange;
}

export interface PaginationResult<_TValue> {
	docs: _TValue[];
	total: number;
	page: PageNumber;
	limit: Limit;
}

/**
 * Offset-based pagination parameters (page/offset + limit).
 * Used for traditional skip/offset pagination strategies.
 */
export interface OffsetPagination {
	offset: number;
	limit: number;
}

/**
 * Cursor-based pagination parameters.
 * Cursor is an opaque string (e.g. a document ID) that marks
 * the position *before* which results should be returned.
 */
export interface CursorPagination {
	limit: number;
	cursor?: string;
}

export interface ComputedPagination {
	page: PageNumber;
	limit: Limit;
	skip: number;
}
