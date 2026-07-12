import { NumericRange } from "../domain/numeric-range";
import { type DurationMs, toDurationMs } from "../domain/primitives/string-ids";

export class DelayRange {
	readonly range: NumericRange;

	get baseMs(): DurationMs {
		return this.range.lo as DurationMs;
	}

	get maxMs(): DurationMs {
		return this.range.hi as DurationMs;
	}

	constructor(baseMs: DurationMs, maxMs: DurationMs) {
		if (baseMs <= 0) {
			throw new RangeError(`baseMs (${baseMs}) must be > 0`);
		}
		this.range = new NumericRange(baseMs, maxMs);
	}

	backoff(attempt: number): DurationMs {
		return toDurationMs(Math.min(this.baseMs * 2 ** attempt, this.maxMs));
	}

	withJitter(attempt: number, jitterMs: DurationMs): DurationMs {
		return toDurationMs(
			this.backoff(attempt) + (jitterMs > 0 ? Math.random() * jitterMs : 0)
		);
	}
}
