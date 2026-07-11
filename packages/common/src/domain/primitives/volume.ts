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

	add(left: Volume, right: Volume): Volume {
		return (left + right) as Volume;
	},

	sub(left: Volume, right: Volume): Volume {
		return (left - right) as Volume;
	},

	gt(left: Volume, right: Volume): boolean {
		return left > right;
	},

	lt(left: Volume, right: Volume): boolean {
		return left < right;
	},

	toNumber(value: Volume): number {
		return value;
	},
};
