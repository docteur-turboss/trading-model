export type Ratio = number & { readonly brand: "Ratio" };

export const Ratio = {
	of(value: number): Ratio {
		if (!Number.isFinite(value)) {
			throw new RangeError(`Ratio must be a finite number, got ${value}`);
		}
		return value as Ratio;
	},

	zero(): Ratio {
		return 0 as Ratio;
	},

	toNumber(value: Ratio): number {
		return value;
	},

	add(left: Ratio, right: Ratio): Ratio {
		return (left + right) as Ratio;
	},

	subtract(left: Ratio, right: Ratio): Ratio {
		return (left - right) as Ratio;
	},

	multiply(left: Ratio, right: Ratio): Ratio {
		return (left * right) as Ratio;
	},

	gt(left: Ratio, right: Ratio): boolean {
		return left > right;
	},

	lt(left: Ratio, right: Ratio): boolean {
		return left < right;
	},

	abs(value: Ratio): Ratio {
		return Math.abs(value) as Ratio;
	},
};
