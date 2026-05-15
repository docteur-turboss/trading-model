// ================================================================
//                   parent selection operators
// ================================================================

import type { Genome, SelectionType } from "./genome_types";

/**
 * Select one parent from `population` using the given strategy.
 *
 * @param population    Current generation (must have `fitness` set).
 * @param type          Selection algorithm.
 * @param rng           Seeded RNG.
 * @param tournamentK   Tournament size (default 3).
 */
export function selectParent(
  population: Genome[],
  type: SelectionType,
  rng: () => number,
  tournamentK = 3,
): Genome {
  switch (type) {
    // ---- Tournament ----
    case "tournament": {
      let best = population[Math.floor(rng() * population.length)];
      for (let i = 1; i < tournamentK; i++) {
        const challenger = population[Math.floor(rng() * population.length)];
        if ((challenger.fitness ?? -Infinity) > (best.fitness ?? -Infinity)) {
          best = challenger;
        }
      }
      return best;
    }

    // ---- Fitness-proportionate (roulette) ----
    case "roulette": {
      const fits  = population.map(g => Math.max(0, g.fitness ?? 0));
      const total = fits.reduce((s, v) => s + v, 0) || 1;
      let pick = rng() * total;
      for (let i = 0; i < population.length; i++) {
        pick -= fits[i];
        if (pick <= 0) return population[i];
      }
      return population[population.length - 1];
    }

    // ---- Rank-based ----
    case "rank": {
      const sorted = [...population].sort((a, b) => (a.fitness ?? 0) - (b.fitness ?? 0));
      const total  = (sorted.length * (sorted.length + 1)) / 2; // ∑ 1..n
      let pick = rng() * total;
      for (let i = 0; i < sorted.length; i++) {
        pick -= i + 1; // rank = position + 1
        if (pick <= 0) return sorted[i];
      }
      return sorted[sorted.length - 1];
    }

    // ---- Truncation / SUS / fallback ----
    case "truncation":
    case "sus":
    default:
      return population[Math.floor(rng() * population.length)];
  }
}