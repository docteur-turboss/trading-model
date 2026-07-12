import { NumericRange } from "../numeric-range";

export type PositiveInt = number & { readonly brand: "PositiveInt" };

export const PositiveInt = {
	of(value: number): PositiveInt {
		if (!Number.isInteger(value) || value < 1) {
			throw new RangeError(
				`PositiveInt must be a positive integer, got ${value}`
			);
		}
		return value as PositiveInt;
	},

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
