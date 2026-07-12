export type NoiseStd = number & { readonly brand: "NoiseStd" };

export const NoiseStd = {
	of(value: number): NoiseStd {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`NoiseStd must be a non-negative finite number, got ${value}`
			);
		}
		return value as NoiseStd;
	},

	zero(): NoiseStd {
		return 0 as NoiseStd;
	},

	toNumber(value: NoiseStd): number {
		return value;
	},
};
