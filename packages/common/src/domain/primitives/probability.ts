export type Probability = number & { readonly brand: "Probability" };

export const Probability = {
	of(value: number): Probability {
		if (!Number.isFinite(value) || value < 0 || value > 1) {
			throw new RangeError(
				`Probability must be a finite number in [0, 1], got ${value}`
			);
		}
		return value as Probability;
	},

	zero(): Probability {
		return 0 as Probability;
	},

	one(): Probability {
		return 1 as Probability;
	},
};
