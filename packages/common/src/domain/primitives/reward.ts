export type Reward = number & { readonly brand: "Reward" };

export const Reward = {
	of(value: number): Reward {
		if (!Number.isFinite(value)) {
			throw new RangeError(`Reward must be a finite number, got ${value}`);
		}
		return value as Reward;
	},

	zero(): Reward {
		return 0 as Reward;
	},
};
