import type {
	GenomeId,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import { createCrossoverGenome, createGAControlGenome } from "./genome-control";
import type { Genome } from "./genome-fitness";
import { createMutationGenome } from "./genome-mutation";
import { GENOME_SECTIONS } from "./genome-sections";

export { createCrossoverGenome, createGAControlGenome } from "./genome-control";
export { createMutationGenome } from "./genome-mutation";
export { createNetworkGenome } from "./genome-network";
export {
	createContinuousPolicyGenome,
	createDiscretePolicyGenome,
	createHorizonGenome,
	createReplayBufferGenome,
	createRewardShapingGenome,
} from "./genome-rl";

export function createDefaultGenome(
	id: string,
	generation = 0 as PositiveInt
): Genome {
	return {
		id: id as GenomeId,
		generation: generation as PositiveInt,
		network: GENOME_SECTIONS.network.create(),
		rl: GENOME_SECTIONS.rl.create(),
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
