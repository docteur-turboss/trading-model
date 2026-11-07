import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type SharpeRatio = BrandedNumber<"SharpeRatio">;
export const SharpeRatio = createNumberBrand<"SharpeRatio">("SharpeRatio", {
	finite: true,
});
