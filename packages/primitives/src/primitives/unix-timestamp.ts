import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type UnixTimestamp = BrandedNumber<"UnixTimestamp">;
export const UnixTimestamp = {
	...createNumberBrand<"UnixTimestamp">("UnixTimestamp", {
		finite: true,
		min: 0,
	}),

	now(): UnixTimestamp {
		return Date.now() as UnixTimestamp;
	},

	toDate(value: UnixTimestamp): Date {
		return new Date(value);
	},

	isAfter(left: UnixTimestamp, right: UnixTimestamp): boolean {
		return left > right;
	},

	isBefore(left: UnixTimestamp, right: UnixTimestamp): boolean {
		return left < right;
	},

	add(value: UnixTimestamp, ms: number): UnixTimestamp {
		return (value + ms) as UnixTimestamp;
	},

	subtract(value: UnixTimestamp, ms: number): UnixTimestamp {
		return (value - ms) as UnixTimestamp;
	},

	elapsed(from: UnixTimestamp): number {
		return UnixTimestamp.now() - from;
	},
};
