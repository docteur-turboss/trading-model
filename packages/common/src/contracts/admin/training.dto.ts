import type { ModelId, Percentage, TradingSymbol } from "../../domain/primitives";

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
	generation: number;
	fitness: number;
	sharpe: number;
	genome?: TrainingGenome;
}

export interface TrainingGenome {
	modelId: ModelId;
	layers: TrainingLayer[];
	optimizer: Optimizer;
	learningRate: Percentage;
	mutationRate: Percentage;
}

export interface TrainingLayer {
	type: LayerType;
	units?: number;
	activation?: ActivationFn;
	rate?: number;
}
