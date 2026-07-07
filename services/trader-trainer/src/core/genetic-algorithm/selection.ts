import type { LamarckGenome } from "./genome-types";
import { SelectionType } from "./genome-types";

export interface SelectionStrategy {
	readonly type: SelectionType;
	select(
		population: LamarckGenome[],
		rng: () => number,
		tournamentK?: number
	): LamarckGenome;
}

function _randomIndex(population: LamarckGenome[], rng: () => number): number {
	return Math.floor(rng() * population.length);
}

function _getFitnessWeights(population: LamarckGenome[]): number[] {
	return population.map((genome) => Math.max(0, genome.fitness ?? 0));
}

function _totalWeight(weights: number[]): number {
	return weights.reduce((sum, value) => sum + value, 0) || 1;
}

function _rouletteSelect(population: LamarckGenome[], weights: number[], rng: () => number): LamarckGenome {
	const total = _totalWeight(weights);
	let pick = rng() * total;
	for (let i = 0; i < population.length; i++) {
		pick -= weights[i];
		if (pick <= 0) {
			return population[i];
		}
	}
	return population[population.length - 1];
}

class TournamentSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Tournament;

	select(
		population: LamarckGenome[],
		rng: () => number,
		tournamentK = 3
	): LamarckGenome {
		let best = population[_randomIndex(population, rng)];
		for (let i = 1; i < tournamentK; i++) {
			const challenger = population[_randomIndex(population, rng)];
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

	select(population: LamarckGenome[], rng: () => number): LamarckGenome {
		const weights = _getFitnessWeights(population);
		return _rouletteSelect(population, weights, rng);
	}
}

class RankSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Rank;

	select(population: LamarckGenome[], rng: () => number): LamarckGenome {
		const sorted = [...population].sort(
			(left, right) => (left.fitness ?? 0) - (right.fitness ?? 0)
		);
		const weights = sorted.map((_unused, i) => i + 1);
		return _rouletteSelect(sorted, weights, rng);
	}
}

class TruncationSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Truncation;

	select(
		population: LamarckGenome[],
		rng: () => number,
		_tournamentK?: number
	): LamarckGenome {
		return population[_randomIndex(population, rng)];
	}
}

class SUSSelection implements SelectionStrategy {
	readonly type: SelectionType = SelectionType.Sus;

	select(population: LamarckGenome[], rng: () => number): LamarckGenome {
		const weights = _getFitnessWeights(population);
		const spacing = _totalWeight(weights) / population.length;
		let pointer = rng() * spacing;
		for (let i = 0; i < population.length; i++) {
			pointer -= weights[i];
			if (pointer <= 0) {
				return population[i];
			}
		}
		return population[population.length - 1];
	}
}

const SELECTION_STRATEGIES: Record<SelectionType, SelectionStrategy> = {
	[SelectionType.Tournament]: new TournamentSelection(),
	[SelectionType.Roulette]: new RouletteSelection(),
	[SelectionType.Rank]: new RankSelection(),
	[SelectionType.Truncation]: new TruncationSelection(),
	[SelectionType.Sus]: new SUSSelection(),
};

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
