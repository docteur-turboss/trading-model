export type FailureCount = number & { readonly brand: "FailureCount" };

export const FailureCount = {
	of(value: number): FailureCount {
		if (!Number.isInteger(value) || value < 0) {
			throw new RangeError(
				`FailureCount must be a non-negative integer, got ${value}`
			);
		}
		return value as FailureCount;
	},

	zero(): FailureCount {
		return 0 as FailureCount;
	},

	toNumber(value: FailureCount): number {
		return value;
	},
};
