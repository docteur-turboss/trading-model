export class NumericRange {
	readonly lo: number;
	readonly hi: number;

	constructor(lo: number, hi: number) {
		if (lo > hi) {
			throw new RangeError(
				`NumericRange: lo (${lo}) must be <= hi (${hi})`
			);
		}
		this.lo = lo;
		this.hi = hi;
	}

	contains(value: number): boolean {
		return value >= this.lo && value <= this.hi;
	}

	clamp(value: number): number {
		if (value < this.lo) return this.lo;
		if (value > this.hi) return this.hi;
		return value;
	}

	span(): number {
		return this.hi - this.lo;
	}
}
