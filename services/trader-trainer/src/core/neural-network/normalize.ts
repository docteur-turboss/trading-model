import type { NormalisationType } from "./type";

export interface Normalizer {
	normalize(
		data: Float32Array,
		len: number,
		params?: { min: number; max: number }
	): Float32Array;
}

export const NORMALIZERS: Record<NormalisationType, Normalizer> = {
	"decimal-scaling": {
		normalize: (data: Float32Array, len: number) => {
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
		},
	},

	"logarithmic-normalization": {
		normalize: (data: Float32Array, len: number) => {
			for (let i = 0; i < len; ++i) {
				const value = data[i];

				data[i] = value < 0 ? -Math.log(1 - value) : Math.log(1 + value);
			}

			return data;
		},
	},

	"min-max": {
		normalize: (data: Float32Array, len: number) => {
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
		},
	},

	"robust-scaling": {
		normalize: (data: Float32Array, len: number) => {
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
	},

	"z-score": {
		normalize: (data: Float32Array, len: number) => {
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
		},
	},

	none: {
		normalize: (data: Float32Array) => {
			return data;
		},
	},

	border: {
		normalize: (
			data: Float32Array,
			len: number,
			params?: { min: number; max: number }
		) => {
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
		},
	},
};
