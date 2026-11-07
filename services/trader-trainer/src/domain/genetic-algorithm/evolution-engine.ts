/**
 * EvolutionEngine: Genetic operators (crossover, mutation, selection).
 * Handles both structural genome mutations and weight-level operations.
 */

import { getLogger } from "@trading-model/contracts/logger-registry";
import { sampleGaussian } from "./noise";

/** Per-weight uniform crossover using separate RNG to produce a child weight vector. */
export function crossoverWeights(
	wa: Float32Array,
	wb: Float32Array,
	rng: () => number
): Float32Array {
	if (wa.length !== wb.length) {
		getLogger().warn(
			"Crossover weight length mismatch — falling back to parent weights"
		);
		return wa.slice();
	}
	const out = new Float32Array(wa.length);
	for (let i = 0; i < out.length; i++) {
		out[i] = rng() < 0.5 ? wa[i] : wb[i];
	}
	return out;
}

export interface MutateWeightsContext {
	weights: Float32Array;
	rate: number;
	std: number;
	rng: () => number;
}

/** Apply Gaussian weight mutation (Box-Muller) to each element with probability `rate`. */
export function mutateWeights(ctx: MutateWeightsContext): Float32Array {
	const { weights, rate, std, rng } = ctx;
	const out = weights.slice();
	for (let i = 0; i < out.length; i++) {
		if (rng() < rate) {
			out[i] += sampleGaussian(rng, std);
		}
	}
	return out;
}
