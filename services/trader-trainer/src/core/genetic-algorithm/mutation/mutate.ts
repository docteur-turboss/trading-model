import type { LamarckGenome } from "../genome-types";
import type { MutateNetworkContext } from "./network-mutation";
import { mutateLayer, mutateNetworkStructure } from "./network-mutation";
import type { MutateRLContext } from "./rl-mutation";
import { mutateRL } from "./rl-mutation";
import { mutateSelfAdaptiveParams } from "./self-adaptive-mutation";
import { adaptSigma } from "./sigma-adapters";

export type { MutateNetworkContext, MutateRLContext };
export { mutateLayer };

export function mutateGenome(
	genome: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const mutationConfig = genome.mutation;
	const sigma = adaptSigma(mutationConfig, rng);

	const network = mutateNetworkStructure({
		genome,
		mutationConfig,
		sigma: sigma,
		rng,
	});

	const rl: typeof genome.rl = mutationConfig.mutateHyperparams
		? mutateRL({ rl: genome.rl, mutation: mutationConfig, sigma: sigma, rng })
		: { ...genome.rl };

	const mutation = mutateSelfAdaptiveParams(mutationConfig, sigma, rng);

	return { ...genome, network, rl, mutation };
}
