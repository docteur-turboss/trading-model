import type {
	GenomeId,
	PositiveInt,
} from "@trading-model/primitives/primitives";
import { createCrossoverGenome, createGAControlGenome } from "./genome-control";
import type { Genome } from "./genome-fitness";
import { createMutationGenome } from "./genome-mutation";
import { createNetworkGenome } from "./genome-network/create";
import { createRLGenome } from "./genome-rl/create";

export function createDefaultGenome(
	id: string,
	generation = 0 as PositiveInt,
	eventDriven = false,
	inputDim?: number
): Genome {
	return {
		id: id as GenomeId,
		generation: generation as PositiveInt,
		network: createNetworkGenome(eventDriven, inputDim),
		rl: createRLGenome(eventDriven),
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
