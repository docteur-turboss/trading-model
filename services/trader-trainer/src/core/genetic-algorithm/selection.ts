// ================================================================
//                   parent selection operators
// ================================================================

import type { LamarckGenome, SelectionType } from "./genome-types";

// ----------------------------------------------------------------
// Selection strategy interface & implementations
// ----------------------------------------------------------------

export interface SelectionStrategy {
	readonly type: SelectionType;
	select(
		population: LamarckGenome[],
		rng: () => number,
		tournamentK?: number
	): LamarckGenome;
}

class TournamentSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Tournament;

	select(
		population: LamarckGenome[],
		rng: () => number,
		tournamentK = 3
	): LamarckGenome {
		let best = population[Math.floor(rng() * population.length)];
		for (let i = 1; i < tournamentK; i++) {
			const challenger = population[Math.floor(rng() * population.length)];
			if (
				(challenger.fitness ?? Number.NEGATIVE_INFINITY) >
				(best.fitness ?? Number.NEGATIVE_INFINITY)
			) {
				best = challenger;
			}
		}
		return best;
	}
}

class RouletteSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Roulette;

	select(
		population: LamarckGenome[],
		rng: () => number
	): LamarckGenome {
		const fits = population.map((genome) => Math.max(0, genome.fitness ?? 0));
		const total = fits.reduce((sum, value) => sum + value, 0) || 1;
		let pick = rng() * total;
		for (let i = 0; i < population.length; i++) {
			pick -= fits[i];
			if (pick <= 0) {
				return population[i];
			}
		}
		return population[population.length - 1];
	}
}

class RankSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Rank;

	select(
		population: LamarckGenome[],
		rng: () => number
	): LamarckGenome {
		const sorted = [...population].sort(
			(left, right) => (left.fitness ?? 0) - (right.fitness ?? 0)
		);
		const total = (sorted.length * (sorted.length + 1)) / 2;
		let pick = rng() * total;
		for (let i = 0; i < sorted.length; i++) {
			pick -= i + 1;
			if (pick <= 0) {
				return sorted[i];
			}
		}
		return sorted[sorted.length - 1];
	}
}

class TruncationSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Truncation;

	select(
		population: LamarckGenome[],
		rng: () => number
	): LamarckGenome {
		return population[Math.floor(rng() * population.length)];
	}
}

class SUSSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Sus;

	select(
		population: LamarckGenome[],
		rng: () => number
	): LamarckGenome {
		return population[Math.floor(rng() * population.length)];
	}
}

const SELECTION_STRATEGIES: Record<SelectionType, SelectionStrategy> = {
	[SelectionType.Tournament]: new TournamentSelection(),
	[SelectionType.Roulette]: new RouletteSelection(),
	[SelectionType.Rank]: new RankSelection(),
	[SelectionType.Truncation]: new TruncationSelection(),
	[SelectionType.Sus]: new SUSSelection(),
};

// ----------------------------------------------------------------
// Public API
// ----------------------------------------------------------------

/**
 * Select one parent from `population` using the given strategy.
 *
 * @param population    Current generation (must have `fitness` set).
 * @param type          Selection algorithm.
 * @param rng           Seeded RNG.
 * @param tournamentK   Tournament size (default 3).
 */
export function selectParent(
	population: LamarckGenome[],
	type: SelectionType,
	rng: () => number,
	tournamentK = 3
): LamarckGenome {
	const strategy = SELECTION_STRATEGIES[type];
	return strategy
		? strategy.select(population, rng, tournamentK)
		: population[Math.floor(rng() * population.length)];
}
