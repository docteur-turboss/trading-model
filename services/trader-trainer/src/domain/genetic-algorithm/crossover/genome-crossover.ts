import type { LamarckGenome } from "../genome-fitness";
import { crossoverNetwork } from "../genome-network/crossover";
import { crossoverRL } from "../genome-rl/crossover";
import { crossoverMutation } from "./crossover-mutation";

export function crossoverGenomes(
	parentA: LamarckGenome,
	parentB: LamarckGenome,
	rng: () => number
): LamarckGenome {
	if (rng() > parentA.crossover.probability) {
		return { ...parentA };
	}

	return {
		...parentA,
		network: crossoverNetwork({
			left: parentA.network,
			right: parentB.network,
			rng,
		}),
		rl: crossoverRL({ left: parentA.rl, right: parentB.rl, rng }),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
