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

	add(value: UnixTimestamp, ms: number): UnixTimestamp {
		return (value + ms) as UnixTimestamp;
	},
};
