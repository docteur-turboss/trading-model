import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type DecimalPrecision = BrandedNumber<"DecimalPrecision">;
export const DecimalPrecision = {
	...createNumberBrand<"DecimalPrecision">("DecimalPrecision", {
		integer: true,
		min: 0,
		max: 15,
		message: (value) =>
			`DecimalPrecision must be an integer in [0, 15], got ${value}`,
	}),

	round(value: number, decimals: DecimalPrecision): number {
		const factor = 10 ** decimals;
		return Math.round(value * factor) / factor;
	},

	toNumber(value: DecimalPrecision): number {
		return value;
	},
};
