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
 * Canonical activation function enum.
 * When adding values here, also add the corresponding runtime implementation
 * in trader-trainer (ActivationType / ACTIVATIONS map) and keep string values aligned.
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
 * When adding values here, also update OptimizerType in trader-trainer.
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
