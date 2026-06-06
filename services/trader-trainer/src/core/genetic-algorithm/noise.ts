// ================================================================
//                noise samplers for mutation
// ================================================================

import type { MutationDistribution } from './genome-types';

// ----------------------------------------------------------------
// Low-level samplers
// ----------------------------------------------------------------

/** Sample from a Gaussian (normal) distribution with mean 0 and given sigma. */
export function sampleGaussian(rng: () => number, sigma: number): number {
  // Box-Muller
  const u1 = Math.max(1e-10, rng());
  const u2 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * sigma;
}

/** Sample from a Cauchy distribution with the given scale. */
export function sampleCauchy(rng: () => number, sigma: number): number {
  return sigma * Math.tan(Math.PI * (rng() - 0.5));
}

/** Sample uniform noise in the range (-sigma, +sigma). */
export function sampleUniform(rng: () => number, sigma: number): number {
  return (rng() * 2 - 1) * sigma;
}

/** Sample Lévy-stable noise (alpha=0.5) with heavy tails for escaping local optima. */
export function sampleLevy(rng: () => number, sigma: number): number {
  // Lévy via Chambers–Mallows–Stuck with α=0.5
  const u = Math.PI * (rng() - 0.5);
  const w = -Math.log(Math.max(1e-10, rng()));
  return (
    ((sigma * Math.sin(0.5 * u)) / Math.pow(Math.cos(u), 2)) * Math.pow(Math.cos(0.5 * u) / w, 1)
  );
}

// ----------------------------------------------------------------
// Dispatcher
// ----------------------------------------------------------------

/** Sample noise from the chosen distribution with the given sigma. */
export function sampleNoise(dist: MutationDistribution, sigma: number, rng: () => number): number {
  switch (dist) {
    case 'gaussian':
      return sampleGaussian(rng, sigma);
    case 'cauchy':
      return sampleCauchy(rng, sigma);
    case 'uniform':
      return sampleUniform(rng, sigma);
    case 'levy':
      return sampleLevy(rng, sigma);
  }
}
