import { createCrossoverGenome, createGAControlGenome } from "./genome-control";
import type { Genome } from "./genome-fitness";
import { createMutationGenome } from "./genome-mutation";
import { createNetworkGenome } from "./genome-network";
import {
	createContinuousPolicyGenome,
	createDiscretePolicyGenome,
	createHorizonGenome,
	createReplayBufferGenome,
	createRewardShapingGenome,
} from "./genome-rl";

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

import {
	type GenomeId,
	Percentage,
	type PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";

function _createDefaultRLGenome() {
	return {
		gamma: Probability.of(0.99),
		learningRate: Percentage.of(1e-3),
		rewardShaping: createRewardShapingGenome(),
		horizon: createHorizonGenome(),
		discretePolicy: createDiscretePolicyGenome(),
		continuousPolicy: createContinuousPolicyGenome(),
		replayBuffer: createReplayBufferGenome(),
	};
}

export function createDefaultGenome(
	id: string,
	generation = 0 as PositiveInt
): Genome {
	return {
		id: id as GenomeId,
		generation: generation as PositiveInt,
		network: createNetworkGenome(),
		rl: _createDefaultRLGenome() as Genome["rl"],
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
