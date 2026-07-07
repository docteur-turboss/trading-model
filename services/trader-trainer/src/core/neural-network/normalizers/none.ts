import type { Normalizer } from "./normalizer-interface";

export class NoneNormalizer implements Normalizer {
	normalize(data: Float32Array): Float32Array {
		return data;
	}
}
