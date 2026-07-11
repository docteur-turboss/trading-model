import type { Price } from "./price";
import type { Volume } from "./volume";

export type Cash = number & { readonly brand: "Cash" };

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

	add(left: Cash, right: Cash): Cash {
		return (left + right) as Cash;
	},

	sub(left: Cash, right: Cash): Cash {
		return (left - right) as Cash;
	},

	gt(left: Cash, right: Cash): boolean {
		return left > right;
	},

	lt(left: Cash, right: Cash): boolean {
		return left < right;
	},

	round(value: Cash, decimals: number): Cash {
		const factor = 10 ** decimals;
		return (Math.round(value * factor) / factor) as Cash;
	},

	fromProduct(volume: Volume, price: Price): Cash {
		return (volume * price) as Cash;
	},

	toNumber(value: Cash): number {
		return value;
	},
};
