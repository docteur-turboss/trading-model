import type { Normalizer } from "./normalizer-interface";

export class RobustScalingNormalizer implements Normalizer {
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
