import { Percentage, Probability } from "@trading-model/primitives/primitives";
import type { CrossoverGenome } from "./genome-control";
import type { LamarckGenome } from "./genome-fitness";
import type { MutationGenome } from "./genome-mutation";
import type { NetworkGenome } from "./genome-network";
import {
	createNetworkGenome,
	crossoverNetwork,
	mutateNetworkStructure,
} from "./genome-network";
import type { RLGenome } from "./genome-rl";
import {
	createDiscretePolicyGenome,
	createHorizonGenome,
	createReplayBufferGenome,
	createRewardShapingGenome,
	crossoverRL,
	mutateRL,
} from "./genome-rl";

interface GenomeSection<TValue> {
	create(): TValue;
	crossover(
		left: TValue,
		right: TValue,
		co: CrossoverGenome,
		rng: () => number
	): TValue;
	mutate(
		genome: LamarckGenome,
		mutation: MutationGenome,
		sigma: number,
		rng: () => number
	): TValue;
}

function createRLGenome(): RLGenome {
	return {
		// 0.9: over 24 seeded markets, 0.99 learned in 14 of them, 0.9 in 19
		// (ADR-0025); the GA still evolves it within [0.8, 0.9999].
		gamma: Probability.of(0.9),
		learningRate: Percentage.of(1e-3),
		rewardShaping: createRewardShapingGenome(),
		horizon: createHorizonGenome(),
		discretePolicy: createDiscretePolicyGenome(),
		replayBuffer: createReplayBufferGenome(),
	};
}

const network: GenomeSection<NetworkGenome> = {
	create: createNetworkGenome,
	crossover: (left, right, co, rng) =>
		crossoverNetwork({ left, right, co, rng }),
	mutate: (genome, mutation, _sigma, rng) =>
		mutateNetworkStructure({ genome, mutationConfig: mutation, rng }),
};

const rl: GenomeSection<RLGenome> = {
	create: createRLGenome,
	crossover: (left, right, co, rng) => crossoverRL({ left, right, co, rng }),
	mutate: (genome, mutation, sigma, rng) =>
		mutation.mutateHyperparams
			? mutateRL({ rl: genome.rl, mutation, sigma, rng })
			: { ...genome.rl },
};

export const GENOME_SECTIONS = { network, rl };
