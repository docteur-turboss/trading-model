export type Price = number & { readonly brand: "Price" };

export const Price = {
	of(value: number): Price {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Price must be a non-negative finite number, got ${value}`
			);
		}
		return value as Price;
	},

	zero(): Price {
		return 0 as Price;
	},

	add(left: Price, right: Price): Price {
		return (left + right) as Price;
	},

	sub(left: Price, right: Price): Price {
		return (left - right) as Price;
	},

	gt(left: Price, right: Price): boolean {
		return left > right;
	},

	lt(left: Price, right: Price): boolean {
		return left < right;
	},

	toNumber(value: Price): number {
		return value;
	},
};
