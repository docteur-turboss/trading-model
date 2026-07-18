import type { DateRange } from "@trading-model/common/domain/date-range";

type MongoDoc = Record<string, unknown>;

export abstract class MongoFilterBuilder<TQuery> {
	abstract build(query: TQuery): MongoDoc;

	protected _addIfPresent(
		filter: MongoDoc,
		key: string,
		value: string | undefined
	): void {
		if (value) {
			filter[key] = value;
		}
	}

	protected _addDateRangeFilter(
		filter: MongoDoc,
		dateRange: DateRange | undefined,
		fieldName = "receivedAt"
	): void {
		if (!dateRange) {
			return;
		}
		const rangeFilter: Record<string, Date | undefined> = {};
		if (dateRange.start) {
			rangeFilter.$gte = dateRange.start;
		}
		if (dateRange.end) {
			rangeFilter.$lte = dateRange.end;
		}
		filter[fieldName] = rangeFilter;
	}
}
