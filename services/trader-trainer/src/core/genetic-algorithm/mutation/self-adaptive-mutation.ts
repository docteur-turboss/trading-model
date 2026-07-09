import type { MutationGenome } from "../genome-types";
import { MutationDistribution } from "../genome-types";
import { sampleGaussian, sampleNoise } from "../noise";
import { clamp } from "../utils";

function _mutateSigma(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): number {
	return Math.max(
		1e-5,
		mutationConfig.sigma +
			sampleNoise(mutationConfig.distribution, sigma * 0.1, rng)
	);
}

function _mutateSelfSigma(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): number {
	return Math.max(
		1e-5,
		mutationConfig.selfSigma +
			sampleNoise(MutationDistribution.Gaussian, sigma * 0.05, rng)
	);
}

export function mutateSelfAdaptiveParams(
	mutationConfig: MutationGenome,
	sigma: number,
	rng: () => number
): MutationGenome {
	return {
		...mutationConfig,
		sigma: _mutateSigma(mutationConfig, sigma, rng),
		selfSigma: _mutateSelfSigma(mutationConfig, sigma, rng),
		rate: clamp(mutationConfig.rate + sampleGaussian(rng, 0.01), 0.001, 0.5),
	};
}
