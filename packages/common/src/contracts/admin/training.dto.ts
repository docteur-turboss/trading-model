import type { ModelId, TradingSymbol } from "../../domain/primitives";

export enum LayerType {
	Dense = "dense",
	Lstm = "lstm",
	Gru = "gru",
	Dropout = "dropout",
	Attention = "attention",
	Normalization = "normalization",
	Conv1d = "conv1d",
}

export enum ActivationFn {
	Relu = "relu",
	Sigmoid = "sigmoid",
	Tanh = "tanh",
	Softmax = "softmax",
	Linear = "linear",
	LeakyRelu = "leaky_relu",
	Gelu = "gelu",
}

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
	learningRate: number;
	mutationRate: number;
}

export interface TrainingLayer {
	type: LayerType;
	units?: number;
	activation?: ActivationFn;
	rate?: number;
}
