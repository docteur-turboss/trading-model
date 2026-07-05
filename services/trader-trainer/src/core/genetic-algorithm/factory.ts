// ================================================================
//                default genome construction
// ================================================================

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

export function createNetworkGenome(): NetworkGenome {
	return {
		inputDim: 32,
		outputDim: 3,
		hiddenLayers: [
			{
				neurons: 64,
				activation: "relu",
				connectionType: "dense-skip",
				biasType: "zeros",
			},
			{
				neurons: 32,
				activation: "relu",
				connectionType: "dense-skip",
				biasType: "zeros",
			},
		],
		normalization: "none",
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
		type: "epsilon_greedy",
		epsilonStart: 1.0,
		epsilonMin: 0.05,
		epsilonDecay: 0.995,
		temperature: 1.0,
	};
}

export function createContinuousPolicyGenome(): ContinuousPolicyGenome {
	return {
		type: "tanh_squashing",
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

export function createMutationGenome(): MutationGenome {
	return {
		rate: 0.1,
		sigma: 0.05,
		noiseStd: 0.02,
		distribution: "gaussian",
		adaptation: "fixed",
		scope: "global",
		selfSigma: 0.05,
		mutateActivations: false,
		activationMutationRate: 0.05,
		mutateHyperparams: true,
		addNeuronRate: 0.01,
		removeNeuronRate: 0.01,
		addLayerRate: 0.005,
		removeLayerRate: 0.005,
		addConnectionRate: 0.01,
		removeConnectionRate: 0.01,
	};
}

export function createCrossoverGenome(): CrossoverGenome {
	return {
		type: "uniform",
		probability: 0.7,
		blendAlpha: 0.5,
		sbxEta: 2,
	};
}

export function createGAControlGenome(): GAControlGenome {
	return {
		populationSize: 20,
		elitismFraction: 0.1,
		survivorFraction: 0.5,
		selectionType: "tournament",
		fitnessType: "total_pnl",
		episodesPerIndividual: 3,
		seedsPerEval: 2,
		rewardThreshold: Number.POSITIVE_INFINITY,
		stagnationPatience: 15,
		maxGenerations: 100,
		timeBudgetMs: 5 * 60 * 1_000,
		envSeed: 42,
		mutationSeed: 1337,
		networkSeed: 7,
		mutationRate: 0.1,
		mutationStd: 0.05,
	};
}

/** Create a genome with sensible default values for network, RL hyperparameters, mutation, crossover, and GA control. */
export function createDefaultGenome(id: string, generation = 0): Genome {
	const rewardShaping = createRewardShapingGenome();
	const horizon = createHorizonGenome();
	const discretePolicy = createDiscretePolicyGenome();
	const continuousPolicy = createContinuousPolicyGenome();
	const replayBuffer = createReplayBufferGenome();

	const rl: RLGenome = {
		gamma: 0.99,
		learningRate: 1e-3,
		rewardShaping,
		horizon,
		discretePolicy,
		continuousPolicy,
		replayBuffer,
	};

	return {
		id,
		generation,
		network: createNetworkGenome(),
		rl,
		mutation: createMutationGenome(),
		crossover: createCrossoverGenome(),
		gaControl: createGAControlGenome(),
	};
}
