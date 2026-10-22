import { sampleGaussian } from "../genetic-algorithm/noise";

/** Small constant used to avoid division by zero / log(0) in numerical algorithms. */
export const EPSILON = 1e-10;

/**
 * Generates a Gaussian-distributed random number with mean 0 and the given
 * standard deviation using the Box-Muller transform.
 *
 * @param scale - Standard deviation of the distribution.
 */
export const GAUSSIAN_NOISE = (scale: number): number =>
	sampleGaussian(Math.random, scale);

export function clipGradients(
	delta: Float32Array,
	maxNorm: number
): Float32Array {
	if (maxNorm <= 0) {
		return delta;
	}
	const data = delta;

	let sum = 0;
	for (const _value of data) {
		sum += _value * _value;
	}
	const norm = Math.sqrt(sum);

	if (norm > maxNorm) {
		const scale = maxNorm / norm;
		for (let i = 0; i < data.length; i++) {
			data[i] *= scale;
		}
		return data;
	}

	return data;
}
