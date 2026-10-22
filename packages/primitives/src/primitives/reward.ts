import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Reward = BrandedNumber<"Reward">;
export const Reward = {
	...createNumberBrand<"Reward">("Reward", { finite: true }),

	zero(): Reward {
		return 0 as Reward;
	},
};
