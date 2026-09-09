import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type FailureCount = BrandedNumber<"FailureCount">;
export const FailureCount = {
	...createNumberBrand<"FailureCount">("FailureCount", {
		integer: true,
		min: 0,
	}),

	zero(): FailureCount {
		return 0 as FailureCount;
	},

	toNumber(value: FailureCount): number {
		return value;
	},
};
