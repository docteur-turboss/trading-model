import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Port = BrandedNumber<"Port">;
export const Port = createNumberBrand<"Port">("Port", {
	integer: true,
	min: 0,
	max: 65535,
});
