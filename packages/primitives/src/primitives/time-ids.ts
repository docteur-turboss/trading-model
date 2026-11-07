import type { BrandedNumber } from "./branded-utils";

export type DurationMs = BrandedNumber<"DurationMs">;
export function toDurationMs(value: number): DurationMs {
	return DurationMs.of(value);
}
export const DurationMs = {
	of(value: number): DurationMs {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`DurationMs must be a non-negative finite number, got ${value}`
			);
		}
		return value as DurationMs;
	},

	zero(): DurationMs {
		return 0 as DurationMs;
	},
	toSeconds(value: DurationMs): number {
		return value / 1000;
	},
	toMinutes(value: DurationMs): number {
		return value / 60000;
	},

	add(left: DurationMs, right: DurationMs): DurationMs {
		return (left + right) as DurationMs;
	},
	multiply(value: DurationMs, factor: number): DurationMs {
		return (value * factor) as DurationMs;
	},

	isLongerThan(left: DurationMs, right: DurationMs): boolean {
		return left > right;
	},
	isShorterThan(left: DurationMs, right: DurationMs): boolean {
		return left < right;
	},

	fromSeconds(seconds: number): DurationMs {
		return DurationMs.of(seconds * 1000);
	},
	fromMinutes(minutes: number): DurationMs {
		return DurationMs.of(minutes * 60000);
	},
};

export type SequenceNumber = BrandedNumber<"SequenceNumber">;
export const SequenceNumber = {
	of(value: number): SequenceNumber {
		if (!Number.isInteger(value) || value < 0) {
			throw new RangeError(
				`SequenceNumber must be a non-negative integer, got ${value}`
			);
		}
		return value as SequenceNumber;
	},

	next(value: SequenceNumber): SequenceNumber {
		return (value + 1) as SequenceNumber;
	},
	toNumber(value: SequenceNumber): number {
		return value;
	},
};
