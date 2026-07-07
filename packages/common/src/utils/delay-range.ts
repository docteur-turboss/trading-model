export class DelayRange {
	constructor(
		readonly baseMs: number,
		readonly maxMs: number,
	) {
		if (baseMs <= 0) throw new RangeError(`baseMs (${baseMs}) must be > 0`);
		if (maxMs < baseMs) throw new RangeError(`maxMs (${maxMs}) must be >= baseMs (${baseMs})`);
	}

	backoff(attempt: number): number {
		return Math.min(this.baseMs * 2 ** attempt, this.maxMs);
	}

	withJitter(attempt: number, jitterMs: number): number {
		return this.backoff(attempt) + (jitterMs > 0 ? Math.random() * jitterMs : 0);
	}
}
