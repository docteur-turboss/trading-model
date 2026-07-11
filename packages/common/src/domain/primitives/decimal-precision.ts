export type DecimalPrecision = number & { readonly brand: "DecimalPrecision" };

export const DecimalPrecision = {
	of(value: number): DecimalPrecision {
		if (!Number.isInteger(value) || value < 0 || value > 15) {
			throw new RangeError(
				`DecimalPrecision must be an integer in [0, 15], got ${value}`
			);
		}
		return value as DecimalPrecision;
	},

	round(value: number, decimals: DecimalPrecision): number {
		const factor = 10 ** decimals;
		return Math.round(value * factor) / factor;
	},

	toNumber(value: DecimalPrecision): number {
		return value;
	},
};
