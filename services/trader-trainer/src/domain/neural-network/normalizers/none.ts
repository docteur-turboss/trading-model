import type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizer-interface";

export const NONE_NORMALIZER: Normalizer = {
	normalize(slice: DataSlice, _params?: NormalizeParams): Float32Array {
		return slice.data;
	},
};
