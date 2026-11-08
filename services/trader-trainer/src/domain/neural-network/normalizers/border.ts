import type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizer-interface";
import { _findMinMax } from "./shared";

export const BORDER: Normalizer = {
	normalize(slice: DataSlice, params?: NormalizeParams): Float32Array {
		const { data, len } = slice;
		const par = params as { min?: number; max?: number } | undefined;
		let lo = params?.lo ?? par?.min;
		let hi = params?.hi ?? par?.max;

		if (lo === undefined || hi === undefined) {
			const range = _findMinMax(data);
			lo ??= range.lo;
			hi ??= range.hi;
		}

		for (let i = 0; i < len; i++) {
			const value = data[i];
			data[i] = Math.min(Math.max(value, lo), hi);
		}

		return data;
	},
};
