import type { Normalizer } from "./normalizer-interface";
import { _computeMean, _computeInvStd } from "./shared";

export class ZScoreNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		const mean = _computeMean(data, len);
		const invStd = _computeInvStd(data, mean, len);
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - mean) * invStd;
		}
		return data;
	}
}
