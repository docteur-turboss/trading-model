import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Probability = BrandedNumber<"Probability">;
export const Probability = {
	...createNumberBrand<"Probability">("Probability", {
		finite: true,
		min: 0,
		max: 1,
	}),

	zero(): Probability {
		return 0 as Probability;
	},

	one(): Probability {
		return 1 as Probability;
	},
};
