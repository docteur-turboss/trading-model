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
};
