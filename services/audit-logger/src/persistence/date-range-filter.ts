import type { DateRange } from "@trading-model/common/domain/date-range";

/**
 * Builds a Mongo `$gte`/`$lte` range object from an optional date range. Shared by the
 * audit-event and log query filter builders.
 */
export function buildDateRangeFilter(
	dateRange?: DateRange
): Record<string, Date | undefined> {
	const rangeFilter: Record<string, Date | undefined> = {};
	if (dateRange?.start) {
		rangeFilter.$gte = dateRange.start;
	}
	if (dateRange?.end) {
		rangeFilter.$lte = dateRange.end;
	}
	return rangeFilter;
}
