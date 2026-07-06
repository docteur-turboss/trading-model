export type LayerType =
	| "dense"
	| "lstm"
	| "gru"
	| "dropout"
	| "attention"
	| "normalization"
	| "conv1d";

export type ActivationFn =
	| "relu"
	| "sigmoid"
	| "tanh"
	| "softmax"
	| "linear"
	| "leaky_relu"
	| "gelu";

export type Optimizer = "adam" | "sgd" | "rmsprop" | "adamw";

export interface TrainingResult {
	id: string;
	symbol: string;
	generation: number;
	fitness: number;
	sharpe: number;
	genome?: TrainingGenome;
}

export interface TrainingGenome {
	modelId: string;
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
