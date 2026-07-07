export type Percentage = number & { readonly __brand: "Percentage" };

export const Percentage = {
	of(value: number): Percentage {
		if (!Number.isFinite(value)) {
			throw new RangeError(`Percentage must be a finite number, got ${value}`);
		}
		return value as Percentage;
	},

	fromPercent(percent: number): Percentage {
		return Percentage.of(percent / 100);
	},

	zero(): Percentage {
		return 0 as Percentage;
	},
};
