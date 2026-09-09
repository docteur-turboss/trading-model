import {
	Percentage,
	Probability,
} from "@trading-model/common/domain/primitives";
import type { CrossoverGenome } from "./genome-control";
import type { LamarckGenome, ValidationContext } from "./genome-fitness";
import type { MutationGenome } from "./genome-mutation";
import type { NetworkGenome } from "./genome-network";
import {
	createNetworkGenome,
	crossoverNetwork,
	mutateNetworkStructure,
	repairNetwork,
	validateNetwork,
} from "./genome-network";
import type { RLGenome } from "./genome-rl";
import {
	createContinuousPolicyGenome,
	createDiscretePolicyGenome,
	createHorizonGenome,
	createReplayBufferGenome,
	createRewardShapingGenome,
	crossoverRL,
	mutateRL,
	repairRL,
	validateRL,
} from "./genome-rl";

export interface GenomeSection<TValue> {
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
	validate(ctx: ValidationContext, value: TValue): void;
	repair(value: TValue): TValue;
}

function createRLGenome(): RLGenome {
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

const network: GenomeSection<NetworkGenome> = {
	create: createNetworkGenome,
	crossover: (left, right, co, rng) =>
		crossoverNetwork({ left, right, co, rng }),
	mutate: (genome, mutation, sigma, rng) =>
		mutateNetworkStructure({ genome, mutationConfig: mutation, sigma, rng }),
	validate: validateNetwork,
	repair: repairNetwork,
};

const rl: GenomeSection<RLGenome> = {
	create: createRLGenome,
	crossover: (left, right, co, rng) => crossoverRL({ left, right, co, rng }),
	mutate: (genome, mutation, sigma, rng) =>
		mutation.mutateHyperparams
			? mutateRL({ rl: genome.rl, mutation, sigma, rng })
			: { ...genome.rl },
	validate: validateRL,
	repair: repairRL,
};

export const GENOME_SECTIONS = { network, rl };
export type GenomeSectionName = keyof typeof GENOME_SECTIONS;
