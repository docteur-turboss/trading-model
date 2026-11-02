import type { BrandedNumber } from "./branded-utils";
import { createAmountBrand } from "./branded-utils";

export type MemoryAmount = BrandedNumber<"MemoryAmount">;
export const MemoryAmount = createAmountBrand("MemoryAmount");
