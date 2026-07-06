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

	contains(date: Date): boolean {
		if (this.start && date < this.start) return false;
		if (this.end && date > this.end) return false;
		return true;
	}

	get durationMs(): number | undefined {
		if (this.start && this.end) {
			return this.end.getTime() - this.start.getTime();
		}
		return undefined;
	}
}
