import type { GenomeId, Price } from "@trading-model/common/domain/primitives";
import type { FeatureVector } from "../feature-vector.js";
import type {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";
import type { EpisodeScores } from "./episode-scores";

export {
	ActivationType,
	ConnectionType,
	InitialisationType,
	NormalisationType,
} from "../neural-network/type";

import type { Bounded } from "./bounded";

/** Clipping bounds for reward shaping and continuous policy. */
export type ClipBounds = Bounded<number>;

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
	clipBounds: Bounded<number>;
	clip: boolean;
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

export enum DiscretePolicyType {
	EpsilonGreedy = "epsilon_greedy",
	Softmax = "softmax",
}

/** Discrete policy hyperparameters for epsilon-greedy or softmax selection. */
export interface DiscretePolicyGenome {
	type: DiscretePolicyType;
	epsilonStart: number;
	epsilonMin: number;
	epsilonDecay: number;
	temperature: number;
}

export enum ContinuousPolicyType {
	ActionClipping = "action_clipping",
	TanhSquashing = "tanh_squashing",
	ExplorationNoise = "exploration_noise",
}

/** Continuous policy hyperparameters for action clipping and exploration noise. */
export interface ContinuousPolicyGenome {
	clipBounds: Bounded<number>;
	type: ContinuousPolicyType;
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

/** Shared scalar hyperparameters: discount factor and step size. */
export interface RLScalars {
	gamma: number;
	learningRate: number;
}

/** Complete reinforcement learning hyperparameter set. */
export interface RLGenome extends RLScalars {
	rewardShaping: RewardShapingGenome;
	horizon: HorizonGenome;
	discretePolicy: DiscretePolicyGenome;
	continuousPolicy: ContinuousPolicyGenome;
	replayBuffer: ReplayBufferGenome;
}

export enum MutationDistribution {
	Gaussian = "gaussian",
	Levy = "levy",
	Uniform = "uniform",
	Cauchy = "cauchy",
}

export enum MutationAdaptation {
	Fixed = "fixed",
	SigmaAdaptive = "sigma_adaptive",
	SelfAdaptive = "self_adaptive",
	Cma = "cma",
}

export enum MutationScope {
	Global = "global",
	PerLayer = "per_layer",
	Correlated = "correlated",
}

/** Mutation rate hyperparameters. */
export interface MutationRates {
	rate: number;
	sigma: number;
	noiseStd: number;
	selfSigma: number;
	activationMutationRate: number;
}

/** Mutation structural modification rates. */
export interface MutationStructural {
	addNeuronRate: number;
	removeNeuronRate: number;
	addLayerRate: number;
	removeLayerRate: number;
	addConnectionRate: number;
	removeConnectionRate: number;
}

/** Mutation operator configuration. */
export interface MutationGenome {
	rates: MutationRates;
	structural: MutationStructural;
	distribution: MutationDistribution;
	adaptation: MutationAdaptation;
	scope: MutationScope;
	mutateActivations: boolean;
	mutateHyperparams: boolean;
}

export enum CrossoverType {
	OnePoint = "one_point",
	TwoPoint = "two_point",
	Uniform = "uniform",
	Arithmetic = "arithmetic",
	Blend = "blend",
	Sbx = "sbx",
}

/** Crossover operator configuration. */
export interface CrossoverGenome {
	type: CrossoverType;
	probability: number;
	blendAlpha: number;
	sbxEta: number;
}

export enum SelectionType {
	Tournament = "tournament",
	Roulette = "roulette",
	Rank = "rank",
	Truncation = "truncation",
	Sus = "sus",
}

export enum FitnessType {
	TotalPnl = "total_pnl",
	Sharpe = "sharpe",
	Sortino = "sortino",
	Calmar = "calmar",
	Composite = "composite",
}

/** GA population control parameters. */
export interface GAPopulationConfig {
	size: number;
	elitismFraction: number;
	survivorFraction: number;
}

export function eliteCount(config: GAPopulationConfig): number {
	return Math.max(1, Math.round(config.size * config.elitismFraction));
}

export function survivorCount(config: GAPopulationConfig): number {
	return Math.max(1, Math.round(config.size * config.survivorFraction));
}

/** GA termination criteria. */
export interface GATerminationConfig {
	rewardThreshold: number;
	stagnationPatience: number;
	maxGenerations: number;
	timeBudgetMs: number;
}

export function shouldTerminateByReward(
	config: GATerminationConfig,
	bestFitness: number
): boolean {
	return bestFitness >= config.rewardThreshold;
}

export function shouldTerminateByStagnation(
	config: GATerminationConfig,
	stagnationGenerations: number
): boolean {
	return stagnationGenerations >= config.stagnationPatience;
}

export function shouldTerminateByBudget(
	config: GATerminationConfig,
	startTimeMs: number
): boolean {
	return Date.now() - startTimeMs >= config.timeBudgetMs;
}

/** GA seeding configuration. */
export interface GASeedingConfig {
	envSeed: number;
	mutationSeed: number;
	networkSeed: number;
}

export function toCombinedSeed(config: GASeedingConfig): number {
	return (
		((config.envSeed * 31 + config.mutationSeed) * 31 + config.networkSeed) | 0
	);
}

/** GA evaluation configuration. */
export interface GAEvaluationConfig {
	episodesPerIndividual: number;
	seedsPerEval: number;
}

/** Self-adaptive GA control parameters. */
export interface GAControlGenome {
	population: GAPopulationConfig;
	termination: GATerminationConfig;
	seeding: GASeedingConfig;
	evaluation: GAEvaluationConfig;
	selectionType: SelectionType;
	fitnessType: FitnessType;
	mutationRate: number;
	mutationStd: number;
}

/** Metadata attached to a genome after fitness evaluation. */
export interface GenomeFitnessMeta {
	episodesRun: number;
	computeMs: number;
	efficiencyScore: number;
	variance: number;
	rawScores: EpisodeScores;
}

/** Top-level genome: network architecture, RL hyperparameters, mutation, crossover, and GA control. */
export interface Genome {
	id: GenomeId;
	generation: number;
	network: NetworkGenome;
	rl: RLGenome;
	mutation: MutationGenome;
	crossover: CrossoverGenome;
	gaControl: GAControlGenome;
}

/** Genome extended with Lamarckian trained weights. */
export type LamarckGenome = Genome & {
	readonly trainedWeights?: Float32Array;
};

/** An evaluated population member: pairs a genome with its computed fitness data. */
export interface PopMember {
	genome: LamarckGenome;
	fitness: number;
	fitnessMeta: GenomeFitnessMeta;
}

/** A single market observation. */
export interface MarketStep {
	price: Price;
	features: FeatureVector;
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
