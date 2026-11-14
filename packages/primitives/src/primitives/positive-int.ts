import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type PositiveInt = BrandedNumber<"PositiveInt">;
export const PositiveInt = {
	...createNumberBrand<"PositiveInt">("PositiveInt", {
		integer: true,
		min: 1,
	}),
};
