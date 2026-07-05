import type { NormalisationType } from "./type";

export interface Normalizer {
	normalize(
		data: Float32Array,
		len: number,
		params?: { min: number; max: number }
	): Float32Array;
}

class DecimalScalingNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		let maxAbs = 0;

		for (const value of data) {
			const abs = Math.abs(value);
			if (abs > maxAbs) {
				maxAbs = abs;
			}
		}

		const j = Math.ceil(Math.log10(maxAbs + 1));
		const denom = 10 ** j;

		for (let i = 0; i < len; i++) {
			data[i] /= denom;
		}

		return data;
	}
}

class LogarithmicNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		for (let i = 0; i < len; ++i) {
			const value = data[i];

			data[i] = value < 0 ? -Math.log(1 - value) : Math.log(1 + value);
		}

		return data;
	}
}

class MinMaxNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
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
		const range = 1 / (max - min) || 1;

		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - min) * range;
		}

		return data;
	}
}

class RobustScalingNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
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
	}
}

class ZScoreNormalizer implements Normalizer {
	normalize(data: Float32Array, len: number): Float32Array {
		let sum = 0;
		for (const value of data) {
			sum += value;
		}

		const mean = sum / len;

		let variance = 0;

		for (const value of data) {
			variance += (value - mean) ** 2;
		}
		const invStd = 1 / (Math.sqrt(variance / len) || 1);

		for (let i = 0; i < len; i++) {
			data[i] = (data[i] - mean) * invStd;
		}

		return data;
	}
}

class NoneNormalizer implements Normalizer {
	normalize(data: Float32Array): Float32Array {
		return data;
	}
}

class BorderNormalizer implements Normalizer {
	normalize(
		data: Float32Array,
		len: number,
		params?: { min: number; max: number }
	): Float32Array {
		let lo = params?.min;
		let hi = params?.max;

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
	}
}

export const DECIMAL_SCALING = new DecimalScalingNormalizer();
export const LOGARITHMIC = new LogarithmicNormalizer();
export const MIN_MAX = new MinMaxNormalizer();
export const ROBUST_SCALING = new RobustScalingNormalizer();
export const Z_SCORE = new ZScoreNormalizer();
export const NONE_NORMALIZER = new NoneNormalizer();
export const BORDER = new BorderNormalizer();

export const NORMALIZERS: Record<NormalisationType, Normalizer> = {
	"decimal-scaling": DECIMAL_SCALING,
	"logarithmic-normalization": LOGARITHMIC,
	"min-max": MIN_MAX,
	"robust-scaling": ROBUST_SCALING,
	"z-score": Z_SCORE,
	none: NONE_NORMALIZER,
	border: BORDER,
};
