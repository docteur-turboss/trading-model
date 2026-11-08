import { mutateNetworkStructure } from "../genome-network/mutation";
import { mutateRL } from "../genome-rl/mutation";
import type { LamarckGenome } from "../genome-types";
import { mutateSelfAdaptiveParams } from "./self-adaptive-mutation";

export function mutateGenome(
	genome: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const mutationConfig = genome.mutation;
	return {
		...genome,
		network: mutateNetworkStructure({ genome, mutationConfig, rng }),
		rl: mutateRL({ rl: genome.rl, rng }),
		mutation: mutateSelfAdaptiveParams(
			mutationConfig,
			mutationConfig.rates.sigma,
			rng
		),
	};
}
