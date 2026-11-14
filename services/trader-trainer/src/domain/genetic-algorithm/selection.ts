import type { LamarckGenome, PopMember } from "./genome";

function _randomIndex(population: PopMember[], rng: () => number): number {
	return Math.floor(rng() * population.length);
}

/**
 * Tournament selection: the fittest of `tournamentK` members drawn with
 * replacement from `population` (evaluated PopMembers).
 */
export function selectParent(
	population: PopMember[],
	rng: () => number,
	tournamentK = 3
): LamarckGenome {
	let best = population[_randomIndex(population, rng)];
	for (let i = 1; i < tournamentK; i++) {
		const challenger = population[_randomIndex(population, rng)];
		if (challenger.fitness > best.fitness) {
			best = challenger;
		}
	}
	return best.genome;
}
