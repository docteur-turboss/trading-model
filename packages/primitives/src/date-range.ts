export class DateRange {
	readonly start?: Date;
	readonly end?: Date;

	constructor(start?: Date, end?: Date) {
		if (start !== undefined && end !== undefined && start > end) {
			throw new RangeError(
				`DateRange: start (${start.toISOString()}) must be <= end (${end.toISOString()})`
			);
		}
		this.start = start;
		this.end = end;
	}

	static fromQueryParams(
		startDate?: string,
		endDate?: string
	): DateRange | undefined {
		if (!(startDate || endDate)) {
			return;
		}
		return new DateRange(
			startDate ? new Date(startDate) : undefined,
			endDate ? new Date(endDate) : undefined
		);
	}
}
