import type { Normalizer, NormalizeParams } from "./normalizer-interface";

export class NoneNormalizer implements Normalizer {
	normalize(
		data: Float32Array,
		_len: number,
		_params?: NormalizeParams
	): Float32Array {
		return data;
	}
}
