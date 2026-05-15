// ================================================================
//        Full genome type definitions for the trading GA
// ================================================================

import { ActivationType, ConnectionType, InitialisationType, NormalisationType } from "core/neural_network/type";
export { ActivationType, NormalisationType, ConnectionType, InitialisationType} from "core/neural_network/type";

export type LayerGenome = {
  neurons:        number;
  activation:     ActivationType;
  connectionType: ConnectionType;
  biasType:       InitialisationType;
};

export type NetworkGenome = {
  inputDim:      number;
  outputDim:     number;
  hiddenLayers:  LayerGenome[];
  normalization: NormalisationType;
};

// ---- Reward shaping genome ----

export type RewardShapingGenome = {
  clip:        boolean;
  clipMin:     number;
  clipMax:     number;
  scale:       boolean;
  scaleFactor: number;
  normalize:   boolean;
  /** Only reward at episode end (sparse) vs each step (dense) */
  sparse:      boolean;
};

// ---- Episode horizon genome ----

export type HorizonGenome = {
  maxEpisodeLength: number;
  nStepReturn:      number; // n-step TD target depth
  frameSkip:        number; // repeat action N ticks before re-inferring
};

// ---- Policy genomes ----

export type DiscretePolicyType = "epsilon_greedy" | "softmax";

export type DiscretePolicyGenome = {
  type:         DiscretePolicyType;
  epsilonStart: number;
  epsilonMin:   number;
  epsilonDecay: number;
  temperature:  number; // for softmax
};

export type ContinuousPolicyType =
  | "action_clipping"
  | "tanh_squashing"
  | "exploration_noise";

export type ContinuousPolicyGenome = {
  type:       ContinuousPolicyType;
  clipMin:    number;
  clipMax:    number;
  noiseStd:   number;
  noiseDecay: number;
};

// ---- Replay buffer genome ----

export type ReplayBufferGenome = {
  bufferSize:  number;
  prioritized: boolean;
  alphaPER:    number; // priority exponent  ∈ [0,1]
  betaPER:     number; // IS correction exponent ∈ [0,1]
  betaAnneal:  boolean;
};

// ---- Full RL genome ----

export type RLGenome = {
  gamma:            number;
  learningRate:     number;
  rewardShaping:    RewardShapingGenome;
  horizon:          HorizonGenome;
  discretePolicy:   DiscretePolicyGenome;
  continuousPolicy: ContinuousPolicyGenome;
  replayBuffer:     ReplayBufferGenome;
};

// ---- Mutation genome ----

export type MutationDistribution = "gaussian" | "levy" | "uniform" | "cauchy";
export type MutationAdaptation   = "fixed" | "sigma_adaptive" | "self_adaptive" | "cma";
export type MutationScope        = "global" | "per_layer" | "correlated";

export type MutationGenome = {
  rate:        number;
  sigma:       number;
  noiseStd:    number;
  distribution: MutationDistribution;
  adaptation:   MutationAdaptation;
  scope:        MutationScope;
  /** Evolved sigma for self-adaptive ES */
  selfSigma:   number;
  // Activation
  mutateActivations:      boolean;
  activationMutationRate: number;
  // Hyperparameter mutation flag
  mutateHyperparams: boolean;
  // Structural rates
  addNeuronRate:        number;
  removeNeuronRate:     number;
  addLayerRate:         number;
  removeLayerRate:      number;
  addConnectionRate:    number;
  removeConnectionRate: number;
};

// ---- Crossover genome ----

export type CrossoverType =
  | "one_point" | "two_point" | "uniform"
  | "arithmetic" | "blend" | "sbx";

export type CrossoverGenome = {
  type:        CrossoverType;
  probability: number;
  blendAlpha:  number; // α for blend / arithmetic
  sbxEta:      number; // η for SBX distribution index
};

// ---- GA control (self-adaptive meta-parameters) ----

export type SelectionType = "tournament" | "roulette" | "rank" | "truncation" | "sus";
export type FitnessType   = "total_pnl" | "sharpe" | "sortino" | "calmar" | "composite";

export type GAControlGenome = {
  // Population
  populationSize:        number;
  elitismFraction:       number;
  survivorFraction:      number;
  // Selection & fitness
  selectionType:         SelectionType;
  fitnessType:           FitnessType;
  // Evaluation budget
  episodesPerIndividual: number;
  seedsPerEval:          number;
  // Stopping criteria
  rewardThreshold:    number;
  stagnationPatience: number;
  maxGenerations:     number;
  timeBudgetMs:       number;
  // Reproducibility seeds
  envSeed:      number;
  mutationSeed: number;
  networkSeed:  number;
};

// ---- Fitness metadata ----

export type GenomeFitnessMeta = {
  episodesRun:     number;
  computeMs:       number;
  /** fitness / computeMs  — core efficiency signal for self-adaptation */
  efficiencyScore: number;
  variance:        number;
  rawScores:       number[];
};

// ---- Top-level genome ----

export type Genome = {
  id:          string;
  generation:  number;
  network:     NetworkGenome;
  rl:          RLGenome;
  mutation:    MutationGenome;
  crossover:   CrossoverGenome;
  gaControl:   GAControlGenome;
  fitness?:    number;
  fitnessMeta?: GenomeFitnessMeta;
};

// ---- Market data ----

export type MarketStep = {
  price:    number;
  features: Float32Array; // observation vector fed to the network
  timestamp?: number;
};