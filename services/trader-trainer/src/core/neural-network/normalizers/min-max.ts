import type { Normalizer } from "./normalizer-interface";
import { _findMinMax } from "./shared";

export class MinMaxNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		const { lo: min, hi: max } = _findMinMax(data);
		const range = 1 / (max - min) || 1;
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - min) * range;
		}
		return data;
	}
}
