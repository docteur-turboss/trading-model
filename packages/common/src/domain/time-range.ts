import type { UnixTimestamp } from "./primitives";

/**
 * @deprecated Use DateRange instead (see date-range.ts). DateRange now supports
 * fromUnixTimestamps() and overlaps(), providing the same features with a
 * consistent start/end naming convention and optional bounds.
 */
export class TimeRange {
	readonly fromMs: UnixTimestamp;
	readonly toMs: UnixTimestamp;

	constructor(fromMs: UnixTimestamp, toMs: UnixTimestamp) {
		if (fromMs > toMs) {
			throw new RangeError(
				`TimeRange: fromMs (${fromMs}) must be <= toMs (${toMs})`
			);
		}
		this.fromMs = fromMs;
		this.toMs = toMs;
	}

	static fromUnixTimestamps(from: UnixTimestamp, to: UnixTimestamp): TimeRange {
		return new TimeRange(from, to);
	}

	get durationMs(): number {
		return this.toMs - this.fromMs;
	}

	contains(timestamp: UnixTimestamp): boolean {
		return timestamp >= this.fromMs && timestamp <= this.toMs;
	}

	overlaps(other: TimeRange): boolean {
		return this.fromMs <= other.toMs && other.fromMs <= this.toMs;
	}
}
