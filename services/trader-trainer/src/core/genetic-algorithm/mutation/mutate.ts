import type { LamarckGenome } from "../genome-types";
import { adaptSigma } from "./sigma-adapters";
import { mutateNetworkStructure, mutateLayer } from "./network-mutation";
import type { MutateNetworkContext } from "./network-mutation";
import { mutateRL } from "./rl-mutation";
import type { MutateRLContext } from "./rl-mutation";
import { mutateSelfAdaptiveParams } from "./self-adaptive-mutation";

export { mutateLayer };
export type { MutateNetworkContext, MutateRLContext };

export function mutateGenome(
	genome: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const mutationConfig = genome.mutation;
	const sigma = adaptSigma(mutationConfig, rng);

	const network = mutateNetworkStructure({
		genome,
		mutationConfig,
		_sigma: sigma,
		rng,
	});

	const rl: typeof genome.rl = mutationConfig.mutateHyperparams
		? mutateRL({ rl: genome.rl, mutation: mutationConfig, _sigma: sigma, rng })
		: { ...genome.rl };

	const mutation = mutateSelfAdaptiveParams(mutationConfig, sigma, rng);

	return { ...genome, network, rl, mutation };
}
