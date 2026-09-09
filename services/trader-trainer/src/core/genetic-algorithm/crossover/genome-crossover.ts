import type { LamarckGenome } from "../genome-fitness";
import { GENOME_SECTIONS } from "../genome-sections";
import { crossoverMutation } from "./crossover-mutation";

export { crossoverMutation } from "./crossover-mutation";

export function crossoverGenomes(
	parentA: LamarckGenome,
	parentB: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const co = parentA.crossover;
	if (rng() > co.probability) {
		return { ...parentA };
	}

	return {
		...parentA,
		network: GENOME_SECTIONS.network.crossover(
			parentA.network,
			parentB.network,
			co,
			rng
		),
		rl: GENOME_SECTIONS.rl.crossover(parentA.rl, parentB.rl, co, rng),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
