import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type DurationMs = BrandedNumber<"DurationMs">;
export function toDurationMs(value: number): DurationMs {
	return DurationMs.of(value);
}
export const DurationMs = {
	...createNumberBrand("DurationMs", {
		min: 0,
		message: (value) =>
			`DurationMs must be a non-negative finite number, got ${value}`,
	}),
	zero(): DurationMs {
		return 0 as DurationMs;
	},
};

export type SequenceNumber = BrandedNumber<"SequenceNumber">;
export const SequenceNumber = createNumberBrand("SequenceNumber", {
	integer: true,
	min: 0,
	message: (value) =>
		`SequenceNumber must be a non-negative integer, got ${value}`,
});
