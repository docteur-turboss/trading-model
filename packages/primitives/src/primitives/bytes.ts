import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type Bytes = BrandedNumber<"Bytes">;
export const Bytes = createNumberBrand<"Bytes">("Bytes");
