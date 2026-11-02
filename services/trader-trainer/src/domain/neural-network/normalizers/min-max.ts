import type { DataSlice, Normalizer } from "./normalizer-interface";
import { _findMinMax } from "./shared";

export const MIN_MAX: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const { lo: min, hi: max } = _findMinMax(data);
		const range = 1 / (max - min) || 1;
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - min) * range;
		}
		return data;
	},
};
