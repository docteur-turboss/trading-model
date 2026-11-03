import type { NumericRange } from "@trading-model/primitives/numeric-range";

export type NormalizeParams = NumericRange;

export interface DataSlice {
	data: Float32Array;
	len: number;
}

export interface Normalizer {
	normalize(slice: DataSlice, params?: NormalizeParams): Float32Array;
}
