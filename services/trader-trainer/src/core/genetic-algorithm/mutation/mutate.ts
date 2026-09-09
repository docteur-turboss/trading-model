import { GENOME_SECTIONS } from "../genome-sections";
import type { LamarckGenome } from "../genome-types";
import { mutateSelfAdaptiveParams } from "./self-adaptive-mutation";
import { adaptSigma } from "./sigma-adapters";

export type { MutateNetworkContext } from "../genome-network";
export { mutateLayer } from "../genome-network";
export type { MutateRLContext } from "../genome-rl";

export function mutateGenome(
	genome: LamarckGenome,
	rng: () => number
): LamarckGenome {
	const mutationConfig = genome.mutation;
	const sigma = adaptSigma(mutationConfig, rng);

	const next: LamarckGenome = {
		...genome,
		network: GENOME_SECTIONS.network.mutate(genome, mutationConfig, sigma, rng),
		rl: GENOME_SECTIONS.rl.mutate(genome, mutationConfig, sigma, rng),
		mutation: mutateSelfAdaptiveParams(mutationConfig, sigma, rng),
	};
	return next;
}
