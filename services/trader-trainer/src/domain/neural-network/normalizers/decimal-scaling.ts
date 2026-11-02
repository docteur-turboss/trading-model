import type { DataSlice, Normalizer } from "./normalizer-interface";
import { _findMaxAbs } from "./shared";

export const DECIMAL_SCALING: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const denom = 10 ** Math.ceil(Math.log10(_findMaxAbs(data) + 1));
		for (let i = 0; i < len; i++) {
			data[i] /= denom;
		}
		return data;
	},
};
