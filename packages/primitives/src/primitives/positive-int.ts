import { NumericRange } from "../numeric-range";
import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type PositiveInt = BrandedNumber<"PositiveInt">;
export const PositiveInt = {
	...createNumberBrand<"PositiveInt">("PositiveInt", {
		integer: true,
		min: 1,
	}),

	one(): PositiveInt {
		return 1 as PositiveInt;
	},

	next(value: PositiveInt): PositiveInt {
		return (value + 1) as PositiveInt;
	},

	prev(value: PositiveInt): PositiveInt {
		if (value <= 1) {
			throw new RangeError(
				`Cannot decrement PositiveInt below 1, got ${value}`
			);
		}
		return (value - 1) as PositiveInt;
	},

	clamp(value: number, min: PositiveInt, max: PositiveInt): PositiveInt {
		return PositiveInt.of(new NumericRange(min, max).clamp(Math.round(value)));
	},

	toNumber(value: PositiveInt): number {
		return value;
	},
};
