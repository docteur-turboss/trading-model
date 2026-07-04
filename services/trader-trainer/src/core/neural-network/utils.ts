/**
 * Generates a Gaussian-distributed random number with mean 0 and the given
 * standard deviation using the Box-Muller transform.
 *
 * @param scale - Standard deviation of the distribution.
 */
export const GAUSSIAN_NOISE = (scale: number): number => {
	const value = Math.max(1e-10, Math.random());
	return (
		Math.sqrt(-2 * Math.log(value)) *
		Math.cos(2 * Math.PI * Math.random()) *
		scale
	);
};
