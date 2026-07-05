/**
 * EvolutionEngine: Genetic operators (crossover, mutation, selection).
 * Handles both structural genome mutations and weight-level operations.
 */

import type { Genome } from "./genome-types";

/** Per-weight uniform crossover using separate RNG to produce a child weight vector. */
export function crossoverWeights(
	wa: Float32Array,
	wb: Float32Array,
	rng: () => number
): Float32Array {
	if (wa.length !== wb.length) {
		return wa.slice(); // architecture mismatch
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
export function mutateWeights(
	ctx: MutateWeightsContext
): Float32Array {
	const { weights, rate, std, rng } = ctx;
	const out = weights.slice();
	for (let i = 0; i < out.length; i++) {
		if (rng() < rate) {
			const u1 = Math.max(1e-10, rng());
			const gauss =
				Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
			out[i] += std * gauss;
		}
	}
	return out;
}

/** Select a parent from the population using the given selection strategy. */
export function selectParent(
	population: Genome[],
	selectionType: string,
	rng: () => number
): Genome {
	if (selectionType === "tournament") {
		const tournamentSize = 3;
		let best = population[Math.floor(rng() * population.length)];
		for (let i = 1; i < tournamentSize; i++) {
			const cand = population[Math.floor(rng() * population.length)];
			if (
				(cand.fitness ?? Number.NEGATIVE_INFINITY) >
				(best.fitness ?? Number.NEGATIVE_INFINITY)
			) {
				best = cand;
			}
		}
		return best;
	}

	// Default: random selection
	return population[Math.floor(rng() * population.length)];
}

/**
 * Apply structural mutations to a genome.
 * Mutates network architecture (layers, neurons, activation functions).
 */
export function mutateGenome(genome: Genome): Genome {
	// Placeholder: implement structural mutations
	// - add/remove hidden layer
	// - change layer size
	// - change activation function
	// Return a mutated copy
	return { ...genome };
}

/**
 * Structural crossover at the topology level.
 * Blends network architectures from two parents.
 */
export function crossoverGenomes(pA: Genome): Genome {
	// Placeholder: implement structural crossover
	// - blend layer counts
	// - blend neuron counts
	// - blend activation functions
	// Return a blended child
	return { ...pA };
}
