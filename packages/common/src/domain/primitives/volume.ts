export type Volume = number & { readonly brand: "Volume" };

export const Volume = {
	of(value: number): Volume {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Volume must be a non-negative finite number, got ${value}`
			);
		}
		return value as Volume;
	},

	zero(): Volume {
		return 0 as Volume;
	},
};
