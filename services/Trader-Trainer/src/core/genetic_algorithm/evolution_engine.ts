/**
 * EvolutionEngine: Genetic operators (crossover, mutation, selection).
 * Handles both structural genome mutations and weight-level operations.
 */

import type { LamarckGenome, Genome } from "./genome_types";

type DeepReadonly<T> =
  T extends (infer U)[] ? ReadonlyArray<DeepReadonly<U>> :
  T extends object      ? { readonly [K in keyof T]: DeepReadonly<T[K]> } :
  T;

/**
 * Per-weight uniform crossover using separate RNG.
 * Produces a new Float32Array with weights alternating from parents.
 */
export function crossoverWeights(
  wa: Float32Array,
  wb: Float32Array,
  rng: () => number,
): Float32Array {
  if (wa.length !== wb.length) return wa.slice(); // architecture mismatch
  const out = new Float32Array(wa.length);
  for (let i = 0; i < out.length; i++) {
    out[i] = rng() < 0.5 ? wa[i] : wb[i];
  }
  return out;
}

/**
 * Gaussian weight mutation using Box-Muller transform.
 */
export function mutateWeights(
  w: Float32Array,
  rate: number,
  std: number,
  rng: () => number,
): Float32Array {
  const out = w.slice();
  for (let i = 0; i < out.length; i++) {
    if (rng() < rate) {
      const u1    = Math.max(1e-10, rng());
      const gauss = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * rng());
      out[i]     += std * gauss;
    }
  }
  return out;
}

/**
 * Select a parent from the population based on selection type.
 * Supported: "tournament", "roulette", "rank"
 */
export function selectParent(
  population: Genome[],
  selectionType: string,
  rng: () => number,
): Genome {
  if (selectionType === "tournament") {
    const k = 3;
    let best = population[Math.floor(rng() * population.length)];
    for (let i = 1; i < k; i++) {
      const cand = population[Math.floor(rng() * population.length)];
      if ((cand.fitness ?? -Infinity) > (best.fitness ?? -Infinity)) {
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
export function mutateGenome(
  g: Genome,
  rng: () => number,
): Genome {
  // Placeholder: implement structural mutations
  // - add/remove hidden layer
  // - change layer size
  // - change activation function
  // Return a mutated copy
  return { ...g };
}

/**
 * Structural crossover at the topology level.
 * Blends network architectures from two parents.
 */
export function crossoverGenomes(
  pA: Genome,
  pB: Genome,
  rng: () => number,
): Genome {
  // Placeholder: implement structural crossover
  // - blend layer counts
  // - blend neuron counts
  // - blend activation functions
  // Return a blended child
  return { ...pA };
}
