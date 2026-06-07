import { OptimizerHyperparams, OptimizerState } from './optimizer';

export type LossFunctionType =
  | 'mean-squared-error'
  | 'cross-entropy'
  | 'mean-biais-error'
  | 'mean-absolute-error'
  | 'root-mean-squared-error'
  | 'huber-loss'
  | 'log-cosh-loss'
  | 'binary-cross-entropy'
  | 'hinge-loss'
  | 'Kullback-Leibler-divergence';

export type NormalisationType =
  | 'min-max'
  | 'z-score'
  | 'decimal-scaling'
  | 'border'
  | 'robust-scaling'
  | 'logarithmic-normalization'
  | 'none';

export type ActivationType =
  | 'sigmoid'
  | 'tanh'
  | 'ReLu'
  | 'leakyReLu'
  | 'GELU'
  | 'softmax'
  | 'ELU'
  | 'mish';

export type ConnectionType = 'fully-connected' | 'dense-skip' | 'residual-connection';
export type InitialisationType = 'zeros' | 'leCun' | 'he' | 'xavier' | 'random';
export type OptimizerType = 'sgd' | 'adam' | 'rmsprop';

/** Network topology and layer configuration. */
export interface NetworkArchitecture {
  /** Number of neurons per layer, from input to output. */
  neuronsByLayer: number[];

  /** Activation function applied to every hidden + output layer. */
  activationType?: ActivationType[];

  /** How to connect layers. */
  connectionType?: ConnectionType;

  /** Normalisation applied to the input vector before the forward pass. */
  normalisationType?: NormalisationType;

  /**
   * Slice of the input vector that is normalised.
   * If omitted the entire input is normalised (or not, per `normalisationType`).
   * `[start, end]` – indices are inclusive on both ends.
   */
  normalizedInputRange?: [number, number];

  /**
   * Enable the experience replay pool.
   * When `false` the pool is never populated and no memory is allocated for it.
   * @default true
   */
  enablePool?: boolean;

  /** Maximum number of experiences kept in the pool (FIFO). @default 10_000 */
  poolMaxSize?: number;
}

/** Hyperparameters controlling the loss computation. */
export interface LossConfig {
  /** Loss function used during backpropagation. */
  lossFunctionType?: LossFunctionType;

  /** Delta threshold for Huber loss. @default 1 */
  deltaHuber?: number;
}

/** Hyperparameters controlling the optimisation loop. */
export interface OptimizerConfig {
  /**
   * Which optimizer to use for weight updates.
   * @default "sgd"
   */
  optimizerType?: OptimizerType;

  /**
   * Overrides for optimizer hyperparameters (beta1, beta2, epsilon).
   * Unset fields fall back to DEFAULT_HYPERPARAMS.
   */
  optimizerHyperparams?: Partial<OptimizerHyperparams>;

  /** Step size used during gradient descent. @default 0.1 */
  learningRate?: number;

  /** Norm used to clip gradients during backpropagation. @default 5.0 */
  gradientClipNorm?: number;
}

/** Weight and bias initialisation settings. */
export interface InitializationConfig {
  /** Strategy used to initialise weight matrices. */
  initialisationType?: InitialisationType;

  /**
   * When `false` bias vectors are zeroed and never updated.
   * @default true
   */
  useBias?: boolean;

  /**
   * Override the initialisation strategy for bias vectors independently from
   * weights.  Falls back to `initialisationType` when omitted.
   */
  biasInitialisationType?: InitialisationType;
}

/** Mutation scale factors for genetic algorithm operators. */
export interface MutationConfig {
  /**
   * Scale factor applied to bias mutations when calling Agent.mutate.
   * Weights use their own scale; biases can be mutated at a different rate.
   * @default 0.05
   */
  biasMutationScale?: number;

  /**
   * Scale factor applied to weight mutations when calling Agent.mutate.
   * @default 0.1
   */
  weightMutationScale?: number;
}

/**
 * Full set of hyperparameters required to build an NeuralNetwork.
 * Composes smaller focused interfaces (ISP).
 */
export interface NeuralNetworkConfig
  extends NetworkArchitecture, LossConfig, OptimizerConfig, InitializationConfig, MutationConfig {}

/**
 * A single experience tuple stored in the replay pool.
 * Used for backpropagation (supervised) or Q-learning.
 */
export interface Experience {
  /** Raw input fed to the network. */
  input: Float32Array;
  /** Output produced by the network for that input. */
  output: Float32Array;
  /** Target label for supervised learning (optional for Q-learning). */
  target?: Float32Array;
  /** Reward received after the action (Q-learning). */
  reward?: number;
  /** Next state observed after the action (Q-learning). */
  nextState?: Float32Array;
  /** Whether the episode terminated after this step (Q-learning). */
  done?: boolean;
}

/**
 * Immutable computation context returned by forward().
 * Contains all intermediate activations and pre-activations for a single forward pass.
 *
 * **Key property**: This is **stateless and reusable**.
 * Multiple parallel forwards can create multiple independent contexts.
 * Backprop uses this context as explicit input (no global state mutation).
 */
export interface ForwardContext {
  /** Raw input that was fed to the network (post-normalization). */
  input: Float32Array;
  /** Final network output. */
  output: Float32Array;
  /** Pre-activations (z values) for each layer. */
  layerZValues: Float32Array[];
  /** Post-activations (outputs) for each layer. */
  layerOutputs: Float32Array[];
}

export interface LayerActivation {
  output: Float32Array;
  z: Float32Array;
}

export interface PooledExperience extends Experience {
  /** Cached activations for each layer from the forward pass. */
  layerActivations: LayerActivation[];
  /** Loss computed during the forward pass. */
  loss: number;
}

export interface LayerMemory {
  weights: Float32Array;
  bias: Float32Array;

  output: Float32Array;
  z: Float32Array;
  delta: Float32Array;

  gradW: Float32Array;
  gradB: Float32Array;

  accumGradW: Float32Array;
  accumGradB: Float32Array;

  fanIn: number;
  fanOut: number;

  wState: OptimizerState;
  bState: OptimizerState;
}
