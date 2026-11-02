import type { BrandedNumber } from "./branded-utils";
import { createAmountBrand } from "./branded-utils";
import type { DecimalPrecision } from "./decimal-precision";
import type { Price } from "./price";
import type { Volume } from "./volume";

export type Cash = BrandedNumber<"Cash">;
export const Cash = {
	...createAmountBrand("Cash"),

	round(value: Cash, decimals: DecimalPrecision): Cash {
		const factor = 10 ** decimals;
		return (Math.round(value * factor) / factor) as Cash;
	},

	fromProduct(volume: Volume, price: Price): Cash {
		return (volume * price) as Cash;
	},
};
