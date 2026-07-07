import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";
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
			neurons: 64,
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
		{
			neurons: 32,
			activation: ActivationType.Relu,
			connectionType: ConnectionType.DenseSkip,
			biasType: InitialisationType.Zeros,
		},
	];
}

export function createNetworkGenome(): NetworkGenome {
	return {
		inputDim: 32,
		outputDim: 3,
		hiddenLayers: _createDefaultHiddenLayers(),
		normalization: NormalisationType.None,
	};
}

export function createRewardShapingGenome(): RewardShapingGenome {
	return {
		clip: false,
		clipMin: -1,
		clipMax: 1,
		scale: false,
		scaleFactor: 1,
		normalize: false,
		sparse: false,
	};
}

export function createHorizonGenome(): HorizonGenome {
	return {
		maxEpisodeLength: 500,
		nStepReturn: 1,
		frameSkip: 1,
	};
}

export function createDiscretePolicyGenome(): DiscretePolicyGenome {
	return {
		type: DiscretePolicyType.EpsilonGreedy,
		epsilonStart: 1.0,
		epsilonMin: 0.05,
		epsilonDecay: 0.995,
		temperature: 1.0,
	};
}

export function createContinuousPolicyGenome(): ContinuousPolicyGenome {
	return {
		type: ContinuousPolicyType.TanhSquashing,
		clipMin: -1,
		clipMax: 1,
		noiseStd: 0.1,
		noiseDecay: 0.999,
	};
}

export function createReplayBufferGenome(): ReplayBufferGenome {
	return {
		bufferSize: 10_000,
		prioritized: false,
		alphaPER: 0.6,
		betaPER: 0.4,
		betaAnneal: true,
	};
}

function _createMutationRateParams(): Partial<MutationGenome> {
	return {
		rate: 0.1,
		sigma: 0.05,
		noiseStd: 0.02,
		selfSigma: 0.05,
		activationMutationRate: 0.05,
	};
}

function _createMutationStructureParams(): Partial<MutationGenome> {
	return {
		addNeuronRate: 0.01,
		removeNeuronRate: 0.01,
		addLayerRate: 0.005,
		removeLayerRate: 0.005,
		addConnectionRate: 0.01,
		removeConnectionRate: 0.01,
	};
}

export function createMutationGenome(): MutationGenome {
	return {
		..._createMutationRateParams(),
		..._createMutationStructureParams(),
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
		probability: 0.7,
		blendAlpha: 0.5,
		sbxEta: 2,
	};
}

function _createGACoreParams(): Partial<GAControlGenome> {
	return {
		populationSize: 20,
		elitismFraction: 0.1,
		survivorFraction: 0.5,
		episodesPerIndividual: 3,
		seedsPerEval: 2,
	};
}

function _createGATerminationParams(): Partial<GAControlGenome> {
	return {
		rewardThreshold: Number.POSITIVE_INFINITY,
		stagnationPatience: 15,
		maxGenerations: 100,
		timeBudgetMs: 5 * 60 * 1_000,
	};
}

function _createGASeedParams(): Partial<GAControlGenome> {
	return {
		envSeed: 42,
		mutationSeed: 1337,
		networkSeed: 7,
		mutationRate: 0.1,
		mutationStd: 0.05,
	};
}

export function createGAControlGenome(): GAControlGenome {
	return {
		..._createGACoreParams(),
		..._createGATerminationParams(),
		..._createGASeedParams(),
		selectionType: SelectionType.Tournament,
		fitnessType: FitnessType.TotalPnl,
	} as GAControlGenome;
}

function _createDefaultRLGenome(): RLGenome {
	return {
		gamma: 0.99,
		learningRate: 1e-3,
		rewardShaping: createRewardShapingGenome(),
		horizon: createHorizonGenome(),
		discretePolicy: createDiscretePolicyGenome(),
		continuousPolicy: createContinuousPolicyGenome(),
		replayBuffer: createReplayBufferGenome(),
	};
}

import {
	type GenomeId,
	toGenomeId,
} from "@trading-model/common/domain/primitives";

/** Create a genome with sensible default values for network, RL hyperparameters, mutation, crossover, and GA control. */
export function createDefaultGenome(id: string, generation = 0): Genome {
	return {
		id,
		generation,
		network: createNetworkGenome(),
		rl: _createDefaultRLGenome(),
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
