import type { Normalizer } from "./normalizer-interface";
import { _findMaxAbs } from "./shared";

export class DecimalScalingNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		const denom = 10 ** Math.ceil(Math.log10(_findMaxAbs(data) + 1));
		for (let i = 0; i < len; i++) {
			data[i] /= denom;
		}
		return data;
	}
}
