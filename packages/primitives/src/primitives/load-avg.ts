import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type LoadAvg = BrandedNumber<"LoadAvg">;
export const LoadAvg = createNumberBrand<"LoadAvg">("LoadAvg");
