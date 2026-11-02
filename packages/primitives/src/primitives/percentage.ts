import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";
import type { DecimalPrecision } from "./decimal-precision";

export type Percentage = BrandedNumber<"Percentage">;
export const Percentage = {
	...createNumberBrand<"Percentage">("Percentage", { finite: true }),

	fromPercent(percent: number): Percentage {
		return Percentage.of(percent / 100);
	},

	zero(): Percentage {
		return 0 as Percentage;
	},

	one(): Percentage {
		return 1 as Percentage;
	},

	toFraction(value: Percentage): number {
		return value;
	},

	toPercent(value: Percentage): number {
		return value * 100;
	},

	add(left: Percentage, right: Percentage): Percentage {
		return (left + right) as Percentage;
	},

	subtract(left: Percentage, right: Percentage): Percentage {
		return (left - right) as Percentage;
	},

	multiply(left: Percentage, right: Percentage): Percentage {
		return (left * right) as Percentage;
	},

	ofValue(percentage: Percentage, value: number): number {
		return value * percentage;
	},

	round(value: Percentage, decimals: DecimalPrecision): Percentage {
		const factor = 10 ** decimals;
		return (Math.round(value * factor) / factor) as Percentage;
	},

	gt(left: Percentage, right: Percentage): boolean {
		return left > right;
	},

	lt(left: Percentage, right: Percentage): boolean {
		return left < right;
	},

	toNumber(value: Percentage): number {
		return value;
	},
};
