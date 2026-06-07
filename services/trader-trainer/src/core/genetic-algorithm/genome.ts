// ================================================================
//        Full genome type definitions for the trading GA
// ================================================================

import { clamp } from './utils';
import {
  ActivationType,
  ConnectionType,
  InitialisationType,
  NormalisationType,
} from '../neural-network/type';
export {
  ActivationType,
  NormalisationType,
  ConnectionType,
  InitialisationType,
} from '../neural-network/type';

export type LayerGenome = {
  neurons: number;
  activation: ActivationType;
  connectionType: ConnectionType;
  biasType: InitialisationType;
};

export type NetworkGenome = {
  inputDim: number;
  outputDim: number;
  hiddenLayers: LayerGenome[];
  normalization: NormalisationType;
};

// ---- Reward shaping genome ----

export type RewardShapingGenome = {
  clip: boolean;
  clipMin: number;
  clipMax: number;
  scale: boolean;
  scaleFactor: number;
  normalize: boolean;
  /** Only reward at episode end (sparse) vs each step (dense) */
  sparse: boolean;
};

// ---- Episode horizon genome ----

export type HorizonGenome = {
  maxEpisodeLength: number;
  nStepReturn: number; // n-step TD target depth
  frameSkip: number; // repeat action N ticks before re-inferring
};

// ---- Policy genomes ----

export type DiscretePolicyType = 'epsilon_greedy' | 'softmax';

export type DiscretePolicyGenome = {
  type: DiscretePolicyType;
  epsilonStart: number;
  epsilonMin: number;
  epsilonDecay: number;
  temperature: number; // for softmax
};

export type ContinuousPolicyType = 'action_clipping' | 'tanh_squashing' | 'exploration_noise';

export type ContinuousPolicyGenome = {
  type: ContinuousPolicyType;
  clipMin: number;
  clipMax: number;
  noiseStd: number;
  noiseDecay: number;
};

// ---- Replay buffer genome ----

export type ReplayBufferGenome = {
  bufferSize: number;
  prioritized: boolean;
  alphaPER: number; // priority exponent  ∈ [0,1]
  betaPER: number; // IS correction exponent ∈ [0,1]
  betaAnneal: boolean;
};

// ---- Full RL genome ----

export type RLGenome = {
  gamma: number;
  learningRate: number;
  rewardShaping: RewardShapingGenome;
  horizon: HorizonGenome;
  discretePolicy: DiscretePolicyGenome;
  continuousPolicy: ContinuousPolicyGenome;
  replayBuffer: ReplayBufferGenome;
};

// ---- Mutation genome ----

export type MutationDistribution = 'gaussian' | 'levy' | 'uniform' | 'cauchy';
export type MutationAdaptation = 'fixed' | 'sigma_adaptive' | 'self_adaptive' | 'cma';
export type MutationScope = 'global' | 'per_layer' | 'correlated';

export type MutationGenome = {
  rate: number;
  sigma: number;
  noiseStd: number;
  distribution: MutationDistribution;
  adaptation: MutationAdaptation;
  scope: MutationScope;
  /** Evolved sigma for self-adaptive ES */
  selfSigma: number;
  // Activation
  mutateActivations: boolean;
  activationMutationRate: number;
  // Hyperparameter mutation flag
  mutateHyperparams: boolean;
  // Structural rates
  addNeuronRate: number;
  removeNeuronRate: number;
  addLayerRate: number;
  removeLayerRate: number;
  addConnectionRate: number;
  removeConnectionRate: number;
};

// ---- Crossover genome ----

export type CrossoverType = 'one_point' | 'two_point' | 'uniform' | 'arithmetic' | 'blend' | 'sbx';

export type CrossoverGenome = {
  type: CrossoverType;
  probability: number;
  blendAlpha: number; // α for blend / arithmetic
  sbxEta: number; // η for SBX distribution index
};

// ---- GA control (self-adaptive meta-parameters) ----

export type SelectionType = 'tournament' | 'roulette' | 'rank' | 'truncation' | 'sus';
export type FitnessType = 'total_pnl' | 'sharpe' | 'sortino' | 'calmar' | 'composite';

export type GAControlGenome = {
  // Population
  populationSize: number;
  elitismFraction: number;
  survivorFraction: number;
  // Selection & fitness
  selectionType: SelectionType;
  fitnessType: FitnessType;
  // Evaluation budget
  episodesPerIndividual: number;
  seedsPerEval: number;
  // Stopping criteria
  rewardThreshold: number;
  stagnationPatience: number;
  maxGenerations: number;
  timeBudgetMs: number;
  // Reproducibility seeds
  envSeed: number;
  mutationSeed: number;
  networkSeed: number;
  // Mutation params
  mutationRate: number;
  mutationStd: number;
};

// ---- Fitness metadata ----

export type GenomeFitnessMeta = {
  episodesRun: number;
  computeMs: number;
  /** fitness / computeMs  — core efficiency signal for self-adaptation */
  efficiencyScore: number;
  variance: number;
  rawScores: number[];
};

// ---- Top-level genome ----

export type Genome = {
  id: string;
  generation: number;
  network: NetworkGenome;
  rl: RLGenome;
  mutation: MutationGenome;
  crossover: CrossoverGenome;
  gaControl: GAControlGenome;
  fitness?: number;
  fitnessMeta?: GenomeFitnessMeta;
};

/** Genome extended with Lamarckian trained weights (optional on birth). */
export type LamarckGenome = Genome & {
  readonly trainedWeights?: Float32Array;
};

// ---- Market data ----

export type MarketStep = {
  price: number;
  features: Float32Array; // observation vector fed to the network
  timestamp?: number;
};

// ----------------------------------------------------------------
// Genome validation (co-located with types to avoid Feature Envy)
// ----------------------------------------------------------------

/** Describes a single genome validation failure. */
export interface ValidationError {
  /** Dot-path of the offending field, e.g. "rl.gamma" */
  path: string;
  message: string;
  /** Value that failed validation */
  actual: unknown;
}

/** Result of genome validation: overall valid flag and list of individual errors. */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const VALID_ACTIVATIONS = new Set<ActivationType>([
  'ReLu',
  'sigmoid',
  'tanh',
  'leakyReLu',
  'ELU',
  'mish',
  'GELU',
  'softmax',
]);
const VALID_CONNECTION_TYPES = new Set<ConnectionType>([
  'dense-skip',
  'fully-connected',
  'residual-connection',
]);
const VALID_BIAS_TYPES = new Set<InitialisationType>(['zeros', 'random', 'xavier', 'he', 'leCun']);
const VALID_NORM_TYPES = new Set<NormalisationType>([
  'none',
  'logarithmic-normalization',
  'decimal-scaling',
  'border',
  'min-max',
  'robust-scaling',
  'z-score',
]);

function err(errors: ValidationError[], path: string, message: string, actual: unknown): void {
  errors.push({ path, message, actual });
}

function checkRange(
  errors: ValidationError[],
  path: string,
  v: unknown,
  lo: number,
  hi: number
): void {
  if (typeof v !== 'number' || !isFinite(v) || v < lo || v > hi) {
    err(errors, path, `must be a finite number in [${lo}, ${hi}]`, v);
  }
}

function checkPositiveInt(errors: ValidationError[], path: string, v: unknown, min = 1): void {
  if (!Number.isInteger(v) || (v as number) < min) {
    err(errors, path, `must be an integer ≥ ${min}`, v);
  }
}

function validateLayer(errors: ValidationError[], path: string, l: LayerGenome): void {
  checkPositiveInt(errors, `${path}.neurons`, l.neurons);
  if (!VALID_ACTIVATIONS.has(l.activation)) {
    err(errors, `${path}.activation`, 'unknown activation type', l.activation);
  }
  if (!VALID_CONNECTION_TYPES.has(l.connectionType)) {
    err(errors, `${path}.connectionType`, 'unknown connection type', l.connectionType);
  }
  if (!VALID_BIAS_TYPES.has(l.biasType)) {
    err(errors, `${path}.biasType`, 'unknown bias type', l.biasType);
  }
}

function repairLayer(l: LayerGenome, _index: number): LayerGenome {
  return {
    neurons: Math.max(1, Math.round(l.neurons ?? 32)),
    activation: VALID_ACTIVATIONS.has(l.activation) ? l.activation : 'ReLu',
    connectionType: VALID_CONNECTION_TYPES.has(l.connectionType) ? l.connectionType : 'dense-skip',
    biasType: VALID_BIAS_TYPES.has(l.biasType) ? l.biasType : 'zeros',
  };
}

/** Validate a genome against all constraints. Returns a list of violations (empty list = valid). */
export function validateGenome(g: Genome): ValidationResult {
  const errors: ValidationError[] = [];

  // ---- Identity ----
  if (typeof g.id !== 'string' || g.id.length === 0) {
    err(errors, 'id', 'must be a non-empty string', g.id);
  }
  if (!Number.isInteger(g.generation) || g.generation < 0) {
    err(errors, 'generation', 'must be a non-negative integer', g.generation);
  }

  // ---- Network ----
  checkPositiveInt(errors, 'network.inputDim', g.network.inputDim);
  checkPositiveInt(errors, 'network.outputDim', g.network.outputDim);

  if (!Array.isArray(g.network.hiddenLayers) || g.network.hiddenLayers.length === 0) {
    err(errors, 'network.hiddenLayers', 'must be a non-empty array', g.network.hiddenLayers);
  } else {
    g.network.hiddenLayers.forEach((l, i) =>
      validateLayer(errors, `network.hiddenLayers[${i}]`, l)
    );
  }

  if (!VALID_NORM_TYPES.has(g.network.normalization)) {
    err(errors, 'network.normalization', 'unknown normalization type', g.network.normalization);
  }

  // ---- RL ----
  checkRange(errors, 'rl.gamma', g.rl.gamma, 0.8, 0.9999);
  checkRange(errors, 'rl.learningRate', g.rl.learningRate, 1e-6, 1e-1);

  const rs = g.rl.rewardShaping;
  if (rs.clipMin >= rs.clipMax) {
    err(errors, 'rl.rewardShaping.clip', 'clipMin must be < clipMax', {
      clipMin: rs.clipMin,
      clipMax: rs.clipMax,
    });
  }
  checkRange(errors, 'rl.rewardShaping.scaleFactor', rs.scaleFactor, 0.001, 1000);

  checkPositiveInt(errors, 'rl.horizon.maxEpisodeLength', g.rl.horizon.maxEpisodeLength, 10);
  checkPositiveInt(errors, 'rl.horizon.nStepReturn', g.rl.horizon.nStepReturn);
  checkPositiveInt(errors, 'rl.horizon.frameSkip', g.rl.horizon.frameSkip);

  const dp = g.rl.discretePolicy;
  checkRange(errors, 'rl.discretePolicy.epsilonStart', dp.epsilonStart, 0.1, 1.0);
  checkRange(errors, 'rl.discretePolicy.epsilonMin', dp.epsilonMin, 0.001, 0.2);
  checkRange(errors, 'rl.discretePolicy.epsilonDecay', dp.epsilonDecay, 0.9, 0.9999);
  checkRange(errors, 'rl.discretePolicy.temperature', dp.temperature, 0.01, 100);

  const cp = g.rl.continuousPolicy;
  if (cp.clipMin >= cp.clipMax) {
    err(errors, 'rl.continuousPolicy.clip', 'clipMin must be < clipMax', {
      clipMin: cp.clipMin,
      clipMax: cp.clipMax,
    });
  }
  checkRange(errors, 'rl.continuousPolicy.noiseStd', cp.noiseStd, 0.001, 5);
  checkRange(errors, 'rl.continuousPolicy.noiseDecay', cp.noiseDecay, 0.9, 0.9999);

  const rb = g.rl.replayBuffer;
  checkPositiveInt(errors, 'rl.replayBuffer.bufferSize', rb.bufferSize, 100);
  checkRange(errors, 'rl.replayBuffer.alphaPER', rb.alphaPER, 0, 1);
  checkRange(errors, 'rl.replayBuffer.betaPER', rb.betaPER, 0, 1);

  // ---- Mutation ----
  const m = g.mutation;
  checkRange(errors, 'mutation.rate', m.rate, 0.001, 0.5);
  checkRange(errors, 'mutation.sigma', m.sigma, 1e-5, 10);
  checkRange(errors, 'mutation.selfSigma', m.selfSigma, 1e-5, 10);

  // ---- Crossover ----
  checkRange(errors, 'crossover.probability', g.crossover.probability, 0, 1);
  checkRange(errors, 'crossover.blendAlpha', g.crossover.blendAlpha, 0, 1);
  checkRange(errors, 'crossover.sbxEta', g.crossover.sbxEta, 1, 100);

  // ---- GA control ----
  const ga = g.gaControl;
  checkPositiveInt(errors, 'gaControl.populationSize', ga.populationSize, 2);
  checkRange(errors, 'gaControl.elitismFraction', ga.elitismFraction, 0, 1);
  checkRange(errors, 'gaControl.survivorFraction', ga.survivorFraction, 0, 1);
  checkPositiveInt(errors, 'gaControl.maxGenerations', ga.maxGenerations);
  checkPositiveInt(errors, 'gaControl.episodesPerIndividual', ga.episodesPerIndividual);

  return { valid: errors.length === 0, errors };
}

/**
 * Return a corrected deep copy of `g`.
 *
 * Repair strategy: clamp numbers to valid bounds, reset enum fields to
 * sensible defaults, ensure structural invariants (e.g. at least one layer,
 * clipMin < clipMax). Repair never throws — if a field is completely
 * unrecognisable it is replaced with the corresponding default value.
 */
export function repairGenome(g: Genome): Genome {
  // ---- Network layers ----
  let hiddenLayers: LayerGenome[] = (
    Array.isArray(g.network.hiddenLayers) ? g.network.hiddenLayers : []
  ).map((l, i) => repairLayer(l, i));

  // Must have at least one hidden layer
  if (hiddenLayers.length === 0) {
    hiddenLayers = [
      { neurons: 32, activation: 'ReLu', connectionType: 'dense-skip', biasType: 'zeros' },
    ];
  }

  const network = {
    inputDim: Math.max(1, Math.round(g.network.inputDim ?? 1)),
    outputDim: Math.max(1, Math.round(g.network.outputDim ?? 1)),
    hiddenLayers,
    normalization: VALID_NORM_TYPES.has(g.network.normalization) ? g.network.normalization : 'none',
  };

  // ---- RL ----
  const rs = g.rl.rewardShaping;
  const rawClipMin = rs.clipMin ?? -1;
  const rawClipMax = rs.clipMax ?? 1;
  const clipMin = Math.min(rawClipMin, rawClipMax - 1e-6);
  const clipMax = Math.max(rawClipMax, rawClipMin + 1e-6);

  const cp = g.rl.continuousPolicy;
  const cpClipMin = Math.min(cp.clipMin ?? -1, (cp.clipMax ?? 1) - 1e-6);
  const cpClipMax = Math.max(cp.clipMax ?? 1, (cp.clipMin ?? -1) + 1e-6);

  const rl: typeof g.rl = {
    gamma: clamp(g.rl.gamma ?? 0.99, 0.8, 0.9999),
    learningRate: clamp(g.rl.learningRate ?? 1e-3, 1e-6, 1e-1),
    rewardShaping: {
      clip: Boolean(rs.clip),
      clipMin,
      clipMax,
      scale: Boolean(rs.scale),
      scaleFactor: Math.max(0.001, rs.scaleFactor ?? 1),
      normalize: Boolean(rs.normalize),
      sparse: Boolean(rs.sparse),
    },
    horizon: {
      maxEpisodeLength: Math.max(10, Math.round(g.rl.horizon.maxEpisodeLength ?? 500)),
      nStepReturn: Math.max(1, Math.round(g.rl.horizon.nStepReturn ?? 1)),
      frameSkip: Math.max(1, Math.round(g.rl.horizon.frameSkip ?? 1)),
    },
    discretePolicy: {
      type: g.rl.discretePolicy.type ?? 'epsilon_greedy',
      epsilonStart: clamp(g.rl.discretePolicy.epsilonStart ?? 1.0, 0.1, 1.0),
      epsilonMin: clamp(g.rl.discretePolicy.epsilonMin ?? 0.05, 0.001, 0.2),
      epsilonDecay: clamp(g.rl.discretePolicy.epsilonDecay ?? 0.995, 0.9, 0.9999),
      temperature: Math.max(0.01, g.rl.discretePolicy.temperature ?? 1.0),
    },
    continuousPolicy: {
      type: g.rl.continuousPolicy.type ?? 'tanh_squashing',
      clipMin: cpClipMin,
      clipMax: cpClipMax,
      noiseStd: Math.max(0.001, cp.noiseStd ?? 0.1),
      noiseDecay: clamp(cp.noiseDecay ?? 0.999, 0.9, 0.9999),
    },
    replayBuffer: {
      bufferSize: Math.max(100, Math.round(g.rl.replayBuffer.bufferSize ?? 10_000)),
      prioritized: Boolean(g.rl.replayBuffer.prioritized),
      alphaPER: clamp(g.rl.replayBuffer.alphaPER ?? 0.6, 0, 1),
      betaPER: clamp(g.rl.replayBuffer.betaPER ?? 0.4, 0, 1),
      betaAnneal: Boolean(g.rl.replayBuffer.betaAnneal),
    },
  };

  // ---- Mutation ----
  const mutation: typeof g.mutation = {
    ...g.mutation,
    rate: clamp(g.mutation.rate ?? 0.1, 0.001, 0.5),
    sigma: Math.max(1e-5, g.mutation.sigma ?? 0.05),
    selfSigma: Math.max(1e-5, g.mutation.selfSigma ?? 0.05),
  };

  // ---- Crossover ----
  const crossover: typeof g.crossover = {
    ...g.crossover,
    probability: clamp(g.crossover.probability ?? 0.7, 0, 1),
    blendAlpha: clamp(g.crossover.blendAlpha ?? 0.5, 0, 1),
    sbxEta: Math.max(1, g.crossover.sbxEta ?? 2),
  };

  // ---- GA control ----
  const gaControl: typeof g.gaControl = {
    ...g.gaControl,
    populationSize: Math.max(2, Math.round(g.gaControl.populationSize ?? 20)),
    elitismFraction: clamp(g.gaControl.elitismFraction ?? 0.1, 0, 1),
    survivorFraction: clamp(g.gaControl.survivorFraction ?? 0.5, 0, 1),
    episodesPerIndividual: Math.max(1, Math.round(g.gaControl.episodesPerIndividual ?? 3)),
    maxGenerations: Math.max(1, Math.round(g.gaControl.maxGenerations ?? 100)),
  };

  return {
    id: typeof g.id === 'string' && g.id.length > 0 ? g.id : 'repaired',
    generation: Math.max(0, Math.round(g.generation ?? 0)),
    network,
    rl,
    mutation,
    crossover,
    gaControl,
    fitness: g.fitness,
  };
}
