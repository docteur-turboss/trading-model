import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type CpuPercent = BrandedNumber<"CpuPercent">;
export const CpuPercent = createNumberBrand<"CpuPercent">("CpuPercent");
