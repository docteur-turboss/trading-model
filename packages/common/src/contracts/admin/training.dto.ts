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
	optimizer: string;
	learningRate: number;
	mutationRate: number;
}

export interface TrainingLayer {
	type: string;
	units?: number;
	activation?: string;
	rate?: number;
}
