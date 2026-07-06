import { UnixTimestamp } from "./primitives";

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

	static fromUnixTimestamps(
		from: UnixTimestamp,
		to: UnixTimestamp
	): TimeRange {
		return new TimeRange(from, to);
	}

	durationMs(): number {
		return this.toMs - this.fromMs;
	}

	contains(timestamp: UnixTimestamp): boolean {
		return timestamp >= this.fromMs && timestamp <= this.toMs;
	}

	overlaps(other: TimeRange): boolean {
		return this.fromMs <= other.toMs && other.fromMs <= this.toMs;
	}
}
