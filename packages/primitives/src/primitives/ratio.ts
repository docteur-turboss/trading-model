import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Ratio = BrandedNumber<"Ratio">;
export const Ratio = {
	...createNumberBrand<"Ratio">("Ratio", { finite: true }),

	zero(): Ratio {
		return 0 as Ratio;
	},

	toNumber(value: Ratio): number {
		return value;
	},

	add(left: Ratio, right: Ratio): Ratio {
		return (left + right) as Ratio;
	},

	subtract(left: Ratio, right: Ratio): Ratio {
		return (left - right) as Ratio;
	},

	multiply(left: Ratio, right: Ratio): Ratio {
		return (left * right) as Ratio;
	},

	gt(left: Ratio, right: Ratio): boolean {
		return left > right;
	},

	lt(left: Ratio, right: Ratio): boolean {
		return left < right;
	},

	abs(value: Ratio): Ratio {
		return Math.abs(value) as Ratio;
	},
};
