import type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizers/normalizer-interface";
import {
	_computeInvStd,
	_computeMean,
	_findMaxAbs,
	_findMinMax,
} from "./normalizers/shared";
import { NormalisationType } from "./type";

export type {
	DataSlice,
	NormalizeParams,
	Normalizer,
} from "./normalizers/normalizer-interface";

const DecimalScaling: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const denom = 10 ** Math.ceil(Math.log10(_findMaxAbs(data) + 1));
		for (let i = 0; i < len; i++) {
			data[i] /= denom;
		}
		return data;
	},
};

const Logarithmic: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		for (let i = 0; i < len; ++i) {
			const value = data[i];
			data[i] = value < 0 ? -Math.log(1 - value) : Math.log(1 + value);
		}
		return data;
	},
};

const MinMax: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const { lo: min, hi: max } = _findMinMax(data);
		const range = 1 / (max - min) || 1;
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - min) * range;
		}
		return data;
	},
};

const RobustScaling: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const sorted = new Float32Array(data);
		sorted.sort();

		const count = len;
		const q1i = (count * 0.25) | 0;
		const q3i = (count * 0.75) | 0;
		const median =
			count & 1
				? sorted[count >> 1]
				: (sorted[(count >> 1) - 1] + sorted[count >> 1]) * 0.5;
		const q1 = sorted[q1i];
		const q3 = sorted[q3i];
		const invIqr = 1 / (q3 - q1 || 1);

		for (let i = 0; i < len; ++i) {
			data[i] = (data[i] - median) * invIqr;
		}
		return data;
	},
};

const ZScore: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const mean = _computeMean(slice);
		const invStd = _computeInvStd(slice, mean);
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - mean) * invStd;
		}
		return data;
	},
};

const None: Normalizer = {
	normalize(slice: DataSlice, _params?: NormalizeParams): Float32Array {
		return slice.data;
	},
};

const Border: Normalizer = {
	normalize(slice: DataSlice, params?: NormalizeParams): Float32Array {
		const { data, len } = slice;
		const par = params as { min?: number; max?: number } | undefined;
		let lo = params?.lo ?? par?.min;
		let hi = params?.hi ?? par?.max;

		if (lo === undefined || hi === undefined) {
			let min = data[0];
			let max = data[0];

			for (const value of data) {
				if (value < min) {
					min = value;
				}
				if (value > max) {
					max = value;
				}
			}

			if (lo === undefined) {
				lo = min;
			}
			if (hi === undefined) {
				hi = max;
			}
		}

		for (let i = 0; i < len; i++) {
			const value = data[i];
			data[i] = value < lo ? lo : value > hi ? hi : value;
		}

		return data;
	},
};

export const DECIMAL_SCALING = DecimalScaling;
export const LOGARITHMIC = Logarithmic;
export const MIN_MAX = MinMax;
export const ROBUST_SCALING = RobustScaling;
export const Z_SCORE = ZScore;
export const NONE_NORMALIZER = None;
export const BORDER = Border;

export const NORMALIZERS: Record<NormalisationType, Normalizer> = {
	[NormalisationType.DecimalScaling]: DECIMAL_SCALING,
	[NormalisationType.LogarithmicNormalization]: LOGARITHMIC,
	[NormalisationType.MinMax]: MIN_MAX,
	[NormalisationType.RobustScaling]: ROBUST_SCALING,
	[NormalisationType.ZScore]: Z_SCORE,
	[NormalisationType.None]: NONE_NORMALIZER,
	[NormalisationType.Border]: BORDER,
};
