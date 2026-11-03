import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type NoiseStd = BrandedNumber<"NoiseStd">;
export const NoiseStd = {
	...createNumberBrand<"NoiseStd">("NoiseStd", { finite: true, min: 0 }),

	zero(): NoiseStd {
		return 0 as NoiseStd;
	},

	toNumber(value: NoiseStd): number {
		return value;
	},
};
