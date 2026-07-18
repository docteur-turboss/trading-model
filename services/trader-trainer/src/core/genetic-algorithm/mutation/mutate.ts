import type { MutateNetworkContext } from "../genome-network";
import { mutateLayer, mutateNetworkStructure } from "../genome-network";
import type { MutateRLContext } from "../genome-rl";
import { mutateRL } from "../genome-rl";
import type { LamarckGenome } from "../genome-types";
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
