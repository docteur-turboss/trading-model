import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Percentage = BrandedNumber<"Percentage">;
export const Percentage = {
	...createNumberBrand<"Percentage">("Percentage", { finite: true }),

	zero(): Percentage {
		return 0 as Percentage;
	},
};
