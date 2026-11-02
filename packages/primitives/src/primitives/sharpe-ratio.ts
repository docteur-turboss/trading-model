import type { BrandedNumber } from "./branded-utils";
import { createNumberBrand } from "./branded-utils";

export type SharpeRatio = BrandedNumber<"SharpeRatio">;
export const SharpeRatio = createNumberBrand<"SharpeRatio">("SharpeRatio", {
	finite: true,
});

export function toSharpeRatio(value: number): SharpeRatio {
	return SharpeRatio.of(value);
}

export function fromSharpeRatio(value: SharpeRatio): number {
	return value;
}
