import type { NumericRange } from "@trading-model/common/domain/numeric-range";

export type NormalizeParams = NumericRange;

export interface Normalizer {
	normalize(
		data: Float32Array,
		len: number,
		params?: NormalizeParams
	): Float32Array;
}
