import type { DataSlice, Normalizer } from "./normalizer-interface";
import { _computeInvStd, _computeMean } from "./shared";

export class ZScoreNormalizer implements Normalizer {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const mean = _computeMean(slice);
		const invStd = _computeInvStd(slice, mean);
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - mean) * invStd;
		}
		return data;
	}
}
