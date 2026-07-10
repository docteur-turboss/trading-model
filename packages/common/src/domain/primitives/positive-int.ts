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
};
