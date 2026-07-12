import type { DataSlice, Normalizer } from "./normalizer-interface";

export class LogarithmicNormalizer implements Normalizer {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		for (let i = 0; i < len; ++i) {
			const value = data[i];
			data[i] = value < 0 ? -Math.log(1 - value) : Math.log(1 + value);
		}
		return data;
	}
}
