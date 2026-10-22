import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Fitness = BrandedNumber<"Fitness">;
export const Fitness = createNumberBrand<"Fitness">("Fitness");
