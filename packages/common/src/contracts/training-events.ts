import type { TradingSymbol } from "../domain/primitives";

export enum TrainingEvent {
	ModelPublished = "training.model.published",
}

export interface TrainingModelPublishedPayload {
	symbol: TradingSymbol;
	generation: number;
	fitness: number;
	sharpe: number;
	avgPnl: number;
	maxDrawdown: number;
	agentId: string;
	gaControl: {
		populationSize: number;
		elitismFraction: number;
		survivorFraction: number;
		episodesPerIndividual: number;
		selectionType: string;
		fitnessType: string;
	};
	network: {
		inputDim: number;
		outputDim: number;
		hiddenLayers: { neurons: number; activation: string }[];
	};
	rl: {
		gamma: number;
		learningRate: number;
		epsilonStart: number;
		epsilonMin: number;
		epsilonDecay: number;
	};
}

export interface TrainingEventMap {
	[TrainingEvent.ModelPublished]: TrainingModelPublishedPayload;
}
