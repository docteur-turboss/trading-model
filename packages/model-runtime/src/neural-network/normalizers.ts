import { NumericRange } from "@trading-model/primitives/numeric-range";
import { NormalisationType } from "./type";

interface DataSlice {
	data: Float32Array;
	len: number;
}

export interface Normalizer {
	normalize(slice: DataSlice): Float32Array;
}

function _findMaxAbs(data: Float32Array): number {
	let maxAbs = 0;
	for (const value of data) {
		const abs = Math.abs(value);
		if (abs > maxAbs) {
			maxAbs = abs;
		}
	}
	return maxAbs;
}

function _findMinMax(data: Float32Array): NumericRange {
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
	return new NumericRange(min, max);
}

function _computeMean(slice: DataSlice): number {
	const { data, len } = slice;
	let sum = 0;
	for (const value of data) {
		sum += value;
	}
	return sum / len;
}

function _computeInvStd(slice: DataSlice, mean: number): number {
	const { data, len } = slice;
	let variance = 0;
	for (const value of data) {
		variance += (value - mean) ** 2;
	}
	return 1 / (Math.sqrt(variance / len) || 1);
}

const DECIMAL_SCALING: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const denom = 10 ** Math.ceil(Math.log10(_findMaxAbs(data) + 1));
		for (let i = 0; i < len; i++) {
			data[i] /= denom;
		}
		return data;
	},
};

const LOGARITHMIC: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		for (let i = 0; i < len; ++i) {
			const value = data[i];
			data[i] = value < 0 ? -Math.log(1 - value) : Math.log(1 + value);
		}
		return data;
	},
};

const MIN_MAX: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		const { data, len } = slice;
		const { lo: min, hi: max } = _findMinMax(data);
		const range = 1 / (max - min || 1);
		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - min) * range;
		}
		return data;
	},
};

const ROBUST_SCALING: Normalizer = {
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

const Z_SCORE: Normalizer = {
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

const NONE_NORMALIZER: Normalizer = {
	normalize(slice: DataSlice): Float32Array {
		return slice.data;
	},
};

export const NORMALIZERS: Record<NormalisationType, Normalizer> = {
	[NormalisationType.DecimalScaling]: DECIMAL_SCALING,
	[NormalisationType.LogarithmicNormalization]: LOGARITHMIC,
	[NormalisationType.MinMax]: MIN_MAX,
	[NormalisationType.RobustScaling]: ROBUST_SCALING,
	[NormalisationType.ZScore]: Z_SCORE,
	[NormalisationType.None]: NONE_NORMALIZER,
	// Border selected nothing: kept for published genomes, replayed as None.
	[NormalisationType.Border]: NONE_NORMALIZER,
};
