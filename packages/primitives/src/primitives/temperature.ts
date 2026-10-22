import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Temperature = BrandedNumber<"Temperature">;
export const Temperature = {
	...createNumberBrand<"Temperature">("Temperature", { finite: true, min: 0 }),

	zero(): Temperature {
		return 0 as Temperature;
	},

	toNumber(value: Temperature): number {
		return value;
	},
};
