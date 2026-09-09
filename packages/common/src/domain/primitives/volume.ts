import type { BrandedNumber } from "./branded-utils";
import { createAmountBrand } from "./branded-utils";

export type Volume = BrandedNumber<"Volume">;
export const Volume = createAmountBrand("Volume");
