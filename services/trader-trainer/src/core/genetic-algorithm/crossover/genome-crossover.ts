import type { LamarckGenome } from "../genome-fitness";
import { crossoverNetwork } from "../genome-network";
import { crossoverRL } from "../genome-rl";
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
		network: crossoverNetwork({
			left: parentA.network,
			right: parentB.network,
			co,
			rng,
		}),
		rl: crossoverRL({ left: parentA.rl, right: parentB.rl, co, rng }),
		mutation: crossoverMutation(parentA.mutation, parentB.mutation, rng),
	};
}
