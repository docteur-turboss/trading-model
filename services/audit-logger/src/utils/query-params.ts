import { DateRange } from "@trading-model/common/domain/date-range";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";

export function parsePageAndLimit(
	queryParams: Record<string, string | undefined>
): PaginationQuery {
	return {
		page: queryParams.page ? Number.parseInt(queryParams.page, 10) : undefined,
		limit: queryParams.limit
			? Number.parseInt(queryParams.limit, 10)
			: undefined,
	};
}

export function parseDateRange(
	queryParams: Record<string, string | undefined>
): DateRange | undefined {
	return DateRange.fromQueryParams(
		queryParams.startDate as string | undefined,
		queryParams.endDate as string | undefined
	);
}
