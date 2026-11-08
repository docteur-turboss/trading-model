import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

/** An integer count that may legitimately be 0 (e.g. the trades of a quiet candle). */
export type NonNegativeInt = BrandedNumber<"NonNegativeInt">;
export const NonNegativeInt = createNumberBrand<"NonNegativeInt">(
	"NonNegativeInt",
	{ integer: true, min: 0 }
);
