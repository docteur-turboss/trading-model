import { UnixTimestamp } from "./primitives";

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

	contains(date: Date): boolean {
		if (this.start && date < this.start) {
			return false;
		}
		if (this.end && date > this.end) {
			return false;
		}
		return true;
	}

	get durationMs(): number | undefined {
		return this.start && this.end
			? this.end.getTime() - this.start.getTime()
			: undefined;
	}

	overlaps(other: DateRange): boolean {
		if (!(this.start && this.end && other.start && other.end)) {
			return false;
		}
		return this.start <= other.end && other.start <= this.end;
	}

	static fromUnixTimestamps(range: {
		fromMs: UnixTimestamp;
		toMs: UnixTimestamp;
	}): DateRange {
		return new DateRange(
			UnixTimestamp.toDate(range.fromMs),
			UnixTimestamp.toDate(range.toMs)
		);
	}
}
