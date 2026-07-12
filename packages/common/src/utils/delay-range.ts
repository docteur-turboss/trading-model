import { type DurationMs, toDurationMs } from "../domain/primitives/string-ids";

export class DelayRange {
	constructor(
		readonly baseMs: DurationMs,
		readonly maxMs: DurationMs
	) {
		if (baseMs <= 0) {
			throw new RangeError(`baseMs (${baseMs}) must be > 0`);
		}
		if (maxMs < baseMs) {
			throw new RangeError(`maxMs (${maxMs}) must be >= baseMs (${baseMs})`);
		}
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
