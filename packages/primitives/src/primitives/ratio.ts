import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Ratio = BrandedNumber<"Ratio">;
export const Ratio = {
	...createNumberBrand<"Ratio">("Ratio", { finite: true }),
};
