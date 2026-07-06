// ================================================================
//                noise samplers for mutation
// ================================================================

import { MutationDistribution } from "./genome-types";

// ----------------------------------------------------------------
// Noise sampler interface
// ----------------------------------------------------------------

export interface NoiseSampler {
	readonly type: MutationDistribution;
	sample(rng: () => number, sigma: number): number;
}

// ----------------------------------------------------------------
// Sampler implementations
// ----------------------------------------------------------------

/** Sample from a Gaussian (normal) distribution with mean 0 and given sigma. */
class GaussianNoiseSampler implements NoiseSampler {
	readonly type: MutationDistribution = MutationDistribution.Gaussian;

	sample(rng: () => number, sigma: number): number {
		const u1 = Math.max(1e-10, rng());
		const u2 = rng();
		return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
	}
}

class CauchyNoiseSampler implements NoiseSampler {
	readonly type: MutationDistribution = MutationDistribution.Cauchy;

	sample(rng: () => number, sigma: number): number {
		return sigma * Math.tan(Math.PI * (rng() - 0.5));
	}
}

class UniformNoiseSampler implements NoiseSampler {
	readonly type: MutationDistribution = MutationDistribution.Uniform;

	sample(rng: () => number, sigma: number): number {
		return (rng() * 2 - 1) * sigma;
	}
}

class LevyNoiseSampler implements NoiseSampler {
	readonly type: MutationDistribution = MutationDistribution.Levy;

	sample(rng: () => number, sigma: number): number {
		const uAngle = Math.PI * (rng() - 0.5);
		const wValue = -Math.log(Math.max(1e-10, rng()));
		return (
			((sigma * Math.sin(0.5 * uAngle)) / Math.cos(uAngle) ** 2) *
			(Math.cos(0.5 * uAngle) / wValue) ** 1
		);
	}
}

// ----------------------------------------------------------------
// Singleton instances
// ----------------------------------------------------------------

export const GAUSSIAN_SAMPLER = new GaussianNoiseSampler();
export const CAUCHY_SAMPLER = new CauchyNoiseSampler();
export const UNIFORM_SAMPLER = new UniformNoiseSampler();
export const LEVY_SAMPLER = new LevyNoiseSampler();

const NOISE_SAMPLERS: Record<MutationDistribution, NoiseSampler> = {
	[MutationDistribution.Gaussian]: GAUSSIAN_SAMPLER,
	[MutationDistribution.Cauchy]: CAUCHY_SAMPLER,
	[MutationDistribution.Uniform]: UNIFORM_SAMPLER,
	[MutationDistribution.Levy]: LEVY_SAMPLER,
};

// ----------------------------------------------------------------
// Convenience wrappers (backward-compatible API)
// ----------------------------------------------------------------

/** Sample from a Gaussian (normal) distribution with mean 0 and given sigma. */
export function sampleGaussian(rng: () => number, sigma: number): number {
	return GAUSSIAN_SAMPLER.sample(rng, sigma);
}

/** Sample from a Cauchy distribution with the given scale. */
export function sampleCauchy(rng: () => number, sigma: number): number {
	return CAUCHY_SAMPLER.sample(rng, sigma);
}

/** Sample uniform noise in the range (-sigma, +sigma). */
export function sampleUniform(rng: () => number, sigma: number): number {
	return UNIFORM_SAMPLER.sample(rng, sigma);
}

/** Sample Lévy-stable noise (alpha=0.5) with heavy tails for escaping local optima. */
export function sampleLevy(rng: () => number, sigma: number): number {
	return LEVY_SAMPLER.sample(rng, sigma);
}

// ----------------------------------------------------------------
// Dispatcher
// ----------------------------------------------------------------

/** Sample noise from the chosen distribution with the given sigma. */
export function sampleNoise(
	dist: MutationDistribution,
	sigma: number,
	rng: () => number
): number {
	const sampler = NOISE_SAMPLERS[dist];
	return sampler
		? sampler.sample(rng, sigma)
		: sampleGaussian(rng, sigma);
}
