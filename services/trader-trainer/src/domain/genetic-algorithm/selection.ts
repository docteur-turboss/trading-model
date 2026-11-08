import type { LamarckGenome, PopMember } from "./genome-types";
import { SelectionType } from "./genome-types";

type SelectionStrategy = (
	population: PopMember[],
	rng: () => number,
	tournamentK: number
) => LamarckGenome;

function _randomIndex(population: PopMember[], rng: () => number): number {
	return Math.floor(rng() * population.length);
}

function _getFitnessWeights(population: PopMember[]): number[] {
	return population.map((member) => Math.max(0, member.fitness));
}

function _totalWeight(weights: number[]): number {
	return weights.reduce((sum, value) => sum + value, 0) || 1;
}

/** First member whose cumulative weight reaches `pointer`. */
function _walk(
	population: PopMember[],
	weights: number[],
	pointer: number
): LamarckGenome {
	for (let i = 0; i < population.length; i++) {
		pointer -= weights[i];
		if (pointer <= 0) {
			return population[i].genome;
		}
	}
	return population[population.length - 1].genome;
}

const SELECTION_STRATEGIES: Record<SelectionType, SelectionStrategy> = {
	[SelectionType.Tournament]: (population, rng, tournamentK) => {
		let best = population[_randomIndex(population, rng)];
		for (let i = 1; i < tournamentK; i++) {
			const challenger = population[_randomIndex(population, rng)];
			if (challenger.fitness > best.fitness) {
				best = challenger;
			}
		}
		return best.genome;
	},
	[SelectionType.Roulette]: (population, rng) => {
		const weights = _getFitnessWeights(population);
		const total = _totalWeight(weights);
		return _walk(population, weights, rng() * total);
	},
	[SelectionType.Rank]: (population, rng) => {
		const sorted = [...population].sort(
			(left, right) => left.fitness - right.fitness
		);
		const weights = sorted.map((_unused, idx) => idx + 1);
		const total = _totalWeight(weights);
		return _walk(sorted, weights, rng() * total);
	},
	[SelectionType.Truncation]: (population, rng) =>
		population[_randomIndex(population, rng)].genome,
	[SelectionType.Sus]: (population, rng) => {
		const weights = _getFitnessWeights(population);
		const spacing = _totalWeight(weights) / population.length;
		return _walk(population, weights, rng() * spacing);
	},
};

/**
 * Select one parent from `population` using the given strategy.
 *
 * @param population    Current generation (evaluated PopMembers).
 * @param type          Selection algorithm.
 * @param rng           Seeded RNG.
 * @param tournamentK   Tournament size (default 3).
 */
export function selectParent(
	population: PopMember[],
	type: SelectionType,
	rng: () => number,
	tournamentK = 3
): LamarckGenome {
	const strategy = SELECTION_STRATEGIES[type];
	return strategy
		? strategy(population, rng, tournamentK)
		: population[_randomIndex(population, rng)].genome;
}
