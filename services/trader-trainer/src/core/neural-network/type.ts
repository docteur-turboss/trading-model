import type { NumericRange } from "@trading-model/common/domain/numeric-range";
import type { OptimizerHyperparams, OptimizerState } from "./optimizer";

export enum LossFunctionType {
	MeanSquaredError = "mean-squared-error",
	CrossEntropy = "cross-entropy",
	MeanBiaisError = "mean-biais-error",
	MeanAbsoluteError = "mean-absolute-error",
	RootMeanSquaredError = "root-mean-squared-error",
	HuberLoss = "huber-loss",
	LogCoshLoss = "log-cosh-loss",
	BinaryCrossEntropy = "binary-cross-entropy",
	HingeLoss = "hinge-loss",
	KullbackLeiblerDivergence = "kullback-leibler",
}

export enum NormalisationType {
	MinMax = "min-max",
	ZScore = "z-score",
	DecimalScaling = "decimal-scaling",
	Border = "border",
	RobustScaling = "robust-scaling",
	LogarithmicNormalization = "logarithmic-normalization",
	None = "none",
}

/**
 * Runtime activation functions.
 * Intentionally differs from ActivationFn (canonical API enum):
 *   - LeakyReLu uses "leakyReLu" (not "leaky_relu") for backward compat with persisted data
 *   - Linear is not exposed at runtime (ActivationFn has it)
 */
export enum ActivationType {
	Sigmoid = "sigmoid",
	Tanh = "tanh",
	Relu = "relu",
	LeakyReLu = "leakyReLu",
	Gelu = "gelu",
	Softmax = "softmax",
	Elu = "elu",
	Mish = "mish",
}

export enum ConnectionType {
	FullyConnected = "fully-connected",
	DenseSkip = "dense-skip",
	ResidualConnection = "residual-connection",
}

export enum InitialisationType {
	Zeros = "zeros",
	LeCun = "leCun",
	He = "he",
	Xavier = "xavier",
	Random = "random",
}

/**
 * Optimizer enum re-exported from common (identical values).
 */
import { Optimizer as OptimizerType } from "@trading-model/common/contracts/admin/training.dto";
export { OptimizerType };

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
	normalizedInputRange?: NumericRange;

	/**
	 * Enable the experience replay pool.
	 * When `false` the pool is never populated and no memory is allocated for it.
	 * @default true
	 */
	enablePool?: boolean;

	/** @default 10_000 */
	poolMaxSize?: number;
}

/** Hyperparameters controlling the loss computation. */
export interface LossConfig {
	/** Loss function used during backpropagation. */
	lossFunctionType?: LossFunctionType;

	/** @default 1 */
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
export interface NetworkInitConfig {
	/** Strategy used to initialise weight matrices. */
	initialisationType?: InitialisationType;

	/** @default true */
	useBias?: boolean;

	/**
	 * Override the initialisation strategy for bias vectors independently from
	 * weights.  Falls back to `initialisationType` when omitted.
	 */
	biasInitialisationType?: InitialisationType;
}

/** Mutation scale factors for genetic algorithm operators. */
export interface MutationConfig {
	/** @default 0.05 */
	biasMutationScale?: number;

	/** @default 0.1 */
	weightMutationScale?: number;
}

/**
 * Full set of hyperparameters required to build an NeuralNetwork.
 * Composes smaller focused interfaces (ISP).
 */
export interface NeuralNetworkConfig
	extends NetworkArchitecture,
		LossConfig,
		OptimizerConfig,
		NetworkInitConfig,
		MutationConfig {}

/**
 * A bare experience tuple stored during fastForward when no RL signal is available.
 */
export interface BareExperience {
	kind: "bare";
	input: Float32Array;
	output: Float32Array;
}

/**
 * A Q-learning experience tuple stored in the replay pool.
 */
export interface QLearningExperience {
	kind: "qlearning";
	input: Float32Array;
	output: Float32Array;
	reward: number;
	nextState: Float32Array;
	done: boolean;
}

/**
 * A supervised-learning experience tuple (ground-truth target available).
 */
export interface SupervisedExperience {
	kind: "supervised";
	input: Float32Array;
	output: Float32Array;
	target: Float32Array;
}

/**
 * A single experience tuple stored in the replay pool.
 * Discriminated by the `kind` field: `'bare'`, `'qlearning'`, or `'supervised'`.
 */
export type Experience =
	| BareExperience
	| QLearningExperience
	| SupervisedExperience;

/**
 * Immutable computation context returned by forward().
 * Contains all intermediate activations and pre-activations for a single forward pass.
 *
 * **Key property**: This is **stateless and reusable**.
 * Multiple parallel forwards can create multiple independent contexts.
 * Backprop uses this context as explicit input (no global state mutation).
 */
export interface ForwardContext {
	input: Float32Array;
	output: Float32Array;
	layerZValues: Float32Array[];
	layerOutputs: Float32Array[];
}

export interface LayerActivation {
	output: Float32Array;
	preActivation: Float32Array;
	/** Pre-activation (z) values for backpropagation. */
	zValues: Float32Array;
}

export interface PooledExperience extends SupervisedExperience {
	/** Cached activations for each layer from the forward pass. */
	layerActivations: LayerActivation[];
	loss: number;
}

export interface LayerWeights {
	weights: Float32Array;
	bias: Float32Array;
}

export interface LayerMemory extends LayerWeights {

	output: Float32Array;
	preActivation: Float32Array;
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
