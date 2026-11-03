import type { BrandedNumber } from "./branded-utils";
import { createAmountBrand } from "./branded-utils";

export type Price = BrandedNumber<"Price">;
export const Price = createAmountBrand("Price");
