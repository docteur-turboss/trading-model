export type Temperature = number & { readonly brand: "Temperature" };

export const Temperature = {
	of(value: number): Temperature {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Temperature must be a non-negative finite number, got ${value}`
			);
		}
		return value as Temperature;
	},

	zero(): Temperature {
		return 0 as Temperature;
	},

	toNumber(value: Temperature): number {
		return value;
	},
};
