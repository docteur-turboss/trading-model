import type { GenomeId } from "@trading-model/common/domain/primitives";
import {
	Fitness,
	Percentage,
	PositiveInt,
	Probability,
} from "@trading-model/common/domain/primitives";
import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";
import { createBounded } from "./bounded";
import type {
	ContinuousPolicyGenome,
	CrossoverGenome,
	DiscretePolicyGenome,
	GAControlGenome,
	Genome,
	HorizonGenome,
	MutationGenome,
	NetworkGenome,
	ReplayBufferGenome,
	RewardShapingGenome,
	RLGenome,
} from "./genome-types";
import {
	ContinuousPolicyType,
	CrossoverType,
	DiscretePolicyType,
	FitnessType,
	MutationAdaptation,
	MutationDistribution,
	MutationScope,
	SelectionType,
} from "./genome-types";

function _createDefaultHiddenLayers(): NetworkGenome["hiddenLayers"] {
	return [
		{
			neurons: PositiveInt.of(64),
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
		{
			neurons: PositiveInt.of(32),
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
	];
}

export function createNetworkGenome(): NetworkGenome {
	return {
		inputDim: PositiveInt.of(32),
		outputDim: PositiveInt.of(3),
		hiddenLayers: _createDefaultHiddenLayers(),
		normalization: NormalisationType.None,
	};
}

export function createRewardShapingGenome(): RewardShapingGenome {
	return {
		clip: false,
		clipBounds: createBounded(-1, 1),
		scale: false,
		scaleFactor: Percentage.of(1),
		normalize: false,
		sparse: false,
	};
}

export function createHorizonGenome(): HorizonGenome {
	return {
		maxEpisodeLength: PositiveInt.of(500),
		nStepReturn: PositiveInt.of(1),
		frameSkip: PositiveInt.of(1),
	};
}

export function createDiscretePolicyGenome(): DiscretePolicyGenome {
	return {
		type: DiscretePolicyType.EpsilonGreedy,
		epsilonStart: Probability.of(1.0),
		epsilonMin: Probability.of(0.05),
		epsilonDecay: Probability.of(0.995),
		temperature: 1.0,
	};
}

export function createContinuousPolicyGenome(): ContinuousPolicyGenome {
	return {
		type: ContinuousPolicyType.TanhSquashing,
		clipBounds: createBounded(-1, 1),
		noiseStd: 0.1,
		noiseDecay: Probability.of(0.999),
	};
}

export function createReplayBufferGenome(): ReplayBufferGenome {
	return {
		bufferSize: PositiveInt.of(10_000),
		prioritized: false,
		alphaPER: Probability.of(0.6),
		betaPER: Probability.of(0.4),
		betaAnneal: true,
	};
}

export function createMutationGenome(): MutationGenome {
	return {
		rates: {
			rate: Percentage.of(0.1),
			sigma: Percentage.of(0.05),
			noiseStd: 0.02,
			selfSigma: Percentage.of(0.05),
			activationMutationRate: Percentage.of(0.05),
		},
		structural: {
			addNeuronRate: Percentage.of(0.01),
			removeNeuronRate: Percentage.of(0.01),
			addLayerRate: Percentage.of(0.005),
			removeLayerRate: Percentage.of(0.005),
			addConnectionRate: Percentage.of(0.01),
			removeConnectionRate: Percentage.of(0.01),
		},
		distribution: MutationDistribution.Gaussian,
		adaptation: MutationAdaptation.Fixed,
		scope: MutationScope.Global,
		mutateActivations: false,
		mutateHyperparams: true,
	} as MutationGenome;
}

export function createCrossoverGenome(): CrossoverGenome {
	return {
		type: CrossoverType.Uniform,
		probability: Probability.of(0.7),
		blendAlpha: Percentage.of(0.5),
		sbxEta: PositiveInt.of(2),
	};
}

export function createGAControlGenome(): GAControlGenome {
	return {
		population: {
			size: PositiveInt.of(20),
			elitismFraction: Probability.of(0.1),
			survivorFraction: Probability.of(0.5),
		},
		termination: {
			rewardThreshold: Fitness.of(Number.POSITIVE_INFINITY),
			stagnationPatience: PositiveInt.of(15),
			maxGenerations: PositiveInt.of(100),
			timeBudgetMs: 5 * 60 * 1_000,
		},
		seeding: {
			envSeed: 42,
			mutationSeed: 1337,
			networkSeed: 7,
		},
		evaluation: {
			episodesPerIndividual: PositiveInt.of(3),
			seedsPerEval: PositiveInt.of(2),
		},
		selectionType: SelectionType.Tournament,
		fitnessType: FitnessType.TotalPnl,
		mutationRate: Percentage.of(0.1),
		mutationStd: Percentage.of(0.05),
	} as GAControlGenome;
}

function _createDefaultRLGenome(): RLGenome {
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

/** Create a genome with sensible default values for network, RL hyperparameters, mutation, crossover, and GA control. */
export function createDefaultGenome(
	id: string,
	generation = 0 as PositiveInt
): Genome {
	return {
		id: id as GenomeId,
		generation: generation as PositiveInt,
		network: createNetworkGenome(),
		rl: _createDefaultRLGenome(),
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
