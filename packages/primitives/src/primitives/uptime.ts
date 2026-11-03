import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Uptime = BrandedNumber<"Uptime">;
export const Uptime = createNumberBrand<"Uptime">("Uptime");
