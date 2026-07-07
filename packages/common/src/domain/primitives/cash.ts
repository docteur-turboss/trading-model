export type Cash = number & { readonly __brand: "Cash" };

export const Cash = {
	of(value: number): Cash {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Cash must be a non-negative finite number, got ${value}`
			);
		}
		return value as Cash;
	},

	zero(): Cash {
		return 0 as Cash;
	},
};
