import {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";

/** Configuration for a single neural network hidden layer. */
export interface LayerGenome {
	neurons: number;
	activation: ActivationType;
	connectionType: ConnectionType;
	biasType: InitialisationType;
}

/** Neural network architecture definition within a genome. */
export interface NetworkGenome {
	inputDim: number;
	outputDim: number;
	hiddenLayers: LayerGenome[];
	normalization: NormalisationType;
}

/** Reward shaping configuration: clipping, scaling, normalisation, and sparse/dense mode. */
export interface RewardShapingGenome {
	clip: boolean;
	clipMin: number;
	clipMax: number;
	scale: boolean;
	scaleFactor: number;
	normalize: boolean;
	sparse: boolean;
}

/** Episode horizon parameters: length, n-step return depth, and frame skip. */
export interface HorizonGenome {
	maxEpisodeLength: number;
	nStepReturn: number;
	frameSkip: number;
}

export type DiscretePolicyType = "epsilon_greedy" | "softmax";

/** Discrete policy hyperparameters for epsilon-greedy or softmax selection. */
export interface DiscretePolicyGenome {
	type: DiscretePolicyType;
	epsilonStart: number;
	epsilonMin: number;
	epsilonDecay: number;
	temperature: number;
}

export type ContinuousPolicyType =
	| "action_clipping"
	| "tanh_squashing"
	| "exploration_noise";

/** Continuous policy hyperparameters for action clipping and exploration noise. */
export interface ContinuousPolicyGenome {
	type: ContinuousPolicyType;
	clipMin: number;
	clipMax: number;
	noiseStd: number;
	noiseDecay: number;
}

/** Experience replay buffer configuration. */
export interface ReplayBufferGenome {
	bufferSize: number;
	prioritized: boolean;
	alphaPER: number;
	betaPER: number;
	betaAnneal: boolean;
}

/** Complete reinforcement learning hyperparameter set. */
export interface RLGenome {
	gamma: number;
	learningRate: number;
	rewardShaping: RewardShapingGenome;
	horizon: HorizonGenome;
	discretePolicy: DiscretePolicyGenome;
	continuousPolicy: ContinuousPolicyGenome;
	replayBuffer: ReplayBufferGenome;
}

export type MutationDistribution = "gaussian" | "levy" | "uniform" | "cauchy";
export type MutationAdaptation =
	| "fixed"
	| "sigma_adaptive"
	| "self_adaptive"
	| "cma";
export type MutationScope = "global" | "per_layer" | "correlated";

/** Mutation operator configuration. */
export interface MutationGenome {
	rate: number;
	sigma: number;
	noiseStd: number;
	distribution: MutationDistribution;
	adaptation: MutationAdaptation;
	scope: MutationScope;
	selfSigma: number;
	mutateActivations: boolean;
	activationMutationRate: number;
	mutateHyperparams: boolean;
	addNeuronRate: number;
	removeNeuronRate: number;
	addLayerRate: number;
	removeLayerRate: number;
	addConnectionRate: number;
	removeConnectionRate: number;
}

export type CrossoverType =
	| "one_point"
	| "two_point"
	| "uniform"
	| "arithmetic"
	| "blend"
	| "sbx";

/** Crossover operator configuration. */
export interface CrossoverGenome {
	type: CrossoverType;
	probability: number;
	blendAlpha: number;
	sbxEta: number;
}

export type SelectionType =
	| "tournament"
	| "roulette"
	| "rank"
	| "truncation"
	| "sus";
export type FitnessType =
	| "total_pnl"
	| "sharpe"
	| "sortino"
	| "calmar"
	| "composite";

/** Self-adaptive GA control parameters. */
export interface GAControlGenome {
	populationSize: number;
	elitismFraction: number;
	survivorFraction: number;
	selectionType: SelectionType;
	fitnessType: FitnessType;
	episodesPerIndividual: number;
	seedsPerEval: number;
	rewardThreshold: number;
	stagnationPatience: number;
	maxGenerations: number;
	timeBudgetMs: number;
	envSeed: number;
	mutationSeed: number;
	networkSeed: number;
	mutationRate: number;
	mutationStd: number;
}

/** Metadata attached to a genome after fitness evaluation. */
export interface GenomeFitnessMeta {
	episodesRun: number;
	computeMs: number;
	efficiencyScore: number;
	variance: number;
	rawScores: number[];
}

/** Top-level genome: network architecture, RL hyperparameters, mutation, crossover, and GA control. */
export interface Genome {
	id: string;
	generation: number;
	network: NetworkGenome;
	rl: RLGenome;
	mutation: MutationGenome;
	crossover: CrossoverGenome;
	gaControl: GAControlGenome;
	fitness?: number;
	fitnessMeta?: GenomeFitnessMeta;
}

/** Genome extended with Lamarckian trained weights. */
export type LamarckGenome = Genome & {
	readonly trainedWeights?: Float32Array;
};

/** A single market observation. */
export interface MarketStep {
	price: number;
	features: Float32Array;
	timestamp?: number;
}

/** Describes a single genome validation failure. */
export interface ValidationError {
	path: string;
	message: string;
	actual: unknown;
}

/** Result of genome validation. */
export interface ValidationResult {
	valid: boolean;
	errors: ValidationError[];
}

export interface ValidationContext {
	errors: ValidationError[];
	path: string;
}
