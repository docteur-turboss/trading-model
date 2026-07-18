import type {
	Fitness,
	ModelId,
	Percentage,
	PositiveInt,
	SharpeRatio,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";

export enum LayerType {
	Dense = "dense",
	Lstm = "lstm",
	Gru = "gru",
	Dropout = "dropout",
	Attention = "attention",
	Normalization = "normalization",
	Conv1d = "conv1d",
}

/**
 * Canonical activation function enum for the API/training contract.
 * Runtime uses ActivationType in trader-trainer which intentionally diverges:
 *   - LeakyRelu → LeakyReLu (backward compat with persisted genomes)
 *   - Linear     is not exposed at runtime
 */
export enum ActivationFn {
	Relu = "relu",
	Sigmoid = "sigmoid",
	Tanh = "tanh",
	Softmax = "softmax",
	Linear = "linear",
	LeakyRelu = "leaky_relu",
	Gelu = "gelu",
	Elu = "elu",
	Mish = "mish",
}

/**
 * Canonical optimizer enum.
 * trader-trainer now re-exports this as OptimizerType (identical values).
 */
export enum Optimizer {
	Adam = "adam",
	Sgd = "sgd",
	Rmsprop = "rmsprop",
	Adamw = "adamw",
}

export interface TrainingResult {
	id: ModelId;
	symbol: TradingSymbol;
	generation: PositiveInt;
	fitness: Fitness;
	sharpe: SharpeRatio;
	genome?: TrainingGenome;
}

export interface TrainingGenome {
	modelId: ModelId;
	layers: TrainingLayer[];
	optimizer: Optimizer;
	learningRate: Percentage;
	mutationRate: Percentage;
}

export interface DenseLayer {
	type:
		| LayerType.Dense
		| LayerType.Lstm
		| LayerType.Gru
		| LayerType.Attention
		| LayerType.Conv1d;
	units: PositiveInt;
	activation: ActivationFn;
}

export interface DropoutLayer {
	type: LayerType.Dropout;
	rate: Percentage;
}

export interface NormalizationLayer {
	type: LayerType.Normalization;
}

export type TrainingLayer = DenseLayer | DropoutLayer | NormalizationLayer;
