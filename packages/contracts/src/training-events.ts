import type { TradingSymbol } from "@trading-model/primitives/primitives";

export enum TrainingEvent {
	ModelPublished = "training.model.published",
}

export interface TrainingModelPublishedPayload {
	symbol: TradingSymbol;
	generation: number;
	/** Fitness of `gaControl.fitnessType` on the wallet PnL (ADR-0025). */
	fitness: number;
	/** Annualised Sharpe of the bar-by-bar evaluation PnL since 2026-10-30 (ADR-0025). */
	sharpe: number;
	/** Mean final PnL of the evaluation episodes. */
	avgPnl: number;
	/**
	 * Largest fall of the cumulative bar-by-bar evaluation PnL of the agent,
	 * >= 0. Published as 0 whatever the agent did until 2026-10-30 (ADR-0022).
	 */
	maxDrawdown: number;
	/** Segment sharpe, avgPnl and maxDrawdown were measured on; "test" since metricsVersion 5 (ADR-0068). */
	evaluatedOn: "validation" | "test";
	agentId: string;
	/**
	 * Version of the stored artifact (`<UTC stamp>-<12 hex of sha256>`); with
	 * `symbol` it is the idempotency key of consumers (ADR-0049 §1.1).
	 */
	version: string;
	/** sha256 of the stored weights, to verify them on download (ADR-0049 §1.2). */
	sha256: string;
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
