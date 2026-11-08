/** Sample from a Gaussian (normal) distribution with mean 0 and given sigma. */
export function sampleGaussian(rng: () => number, sigma: number): number {
	const u1 = Math.max(1e-10, rng());
	const u2 = rng();
	return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}
