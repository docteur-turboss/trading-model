import type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizer-interface";

export class NoneNormalizer implements Normalizer {
	normalize(slice: DataSlice, _params?: NormalizeParams): Float32Array {
		return slice.data;
	}
}
