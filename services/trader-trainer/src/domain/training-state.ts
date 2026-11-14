import {
	type Fitness,
	NonNegativeInt,
	type Percentage,
	type PositiveInt,
	type Probability,
	type SharpeRatio,
} from "@trading-model/primitives/primitives";
import type {
	ActivationType,
	FitnessType,
	GenomeFitnessMeta,
	LamarckGenome,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { buildSummary } from "./genome-summary-builder";
import type { TradingSymbol } from "./market-data-types";

/** Summary of the best trained agent for API responses. */
export interface BestAgentSummary {
	id: string;
	generation: NonNegativeInt;
	fitness: Fitness;
	sharpe: SharpeRatio;
	avgPnl: number;
	/** Segment sharpe, avgPnl and maxDrawdown were measured on (ADR-0068). */
	evaluatedOn: "validation" | "test";
	/** Largest fall of the cumulative evaluation PnL (`EpisodeScores.maxDrawdown`). */
	maxDrawdown: number;
	gaControl: {
		populationSize: PositiveInt;
		elitismFraction: Probability;
		survivorFraction: Probability;
		episodesPerIndividual: PositiveInt;
		selectionType: SelectionType;
		fitnessType: FitnessType;
	};
	network: {
		inputDim: PositiveInt;
		outputDim: PositiveInt;
		hiddenLayers: { neurons: PositiveInt; activation: ActivationType }[];
	};
	rl: {
		gamma: Probability;
		learningRate: Percentage;
		epsilonStart: Probability;
		epsilonMin: Probability;
		epsilonDecay: Probability;
	};
}

interface LastTrainingInfoData {
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: Fitness;
	bestFitnessMeta: GenomeFitnessMeta | undefined;
	generation: NonNegativeInt;
}

export interface TrainingSnapshot {
	readonly symbol: TradingSymbol;
	readonly generation: NonNegativeInt;
	buildBestAgentSummary(): BestAgentSummary | null;
}

export class NullLastTrainingInfo implements TrainingSnapshot {
	readonly symbol: TradingSymbol = "" as TradingSymbol;
	readonly generation: NonNegativeInt = NonNegativeInt.of(0);

	buildBestAgentSummary(): BestAgentSummary | null {
		return null;
	}
}

export class LastTrainingInfo implements TrainingSnapshot {
	readonly symbol: TradingSymbol;
	readonly bestGenome: DeepReadonly<LamarckGenome>;
	readonly bestFitness: Fitness;
	readonly bestFitnessMeta: GenomeFitnessMeta | undefined;
	readonly generation: NonNegativeInt;

	constructor(data: LastTrainingInfoData) {
		this.symbol = data.symbol;
		this.bestGenome = data.bestGenome;
		this.bestFitness = data.bestFitness;
		this.bestFitnessMeta = data.bestFitnessMeta;
		this.generation = data.generation;
	}

	buildBestAgentSummary(): BestAgentSummary | null {
		return buildSummary(
			this.bestGenome,
			this.bestFitness,
			this.bestFitnessMeta
		);
	}
}

/**
 * Snapshot rebuilt at startup from the newest model manifest (ADR-0022), until
 * a training replaces it. The genome of a manifest has no weights, only the
 * topology, RL and GA genes the summary needs.
 */
export class ArtifactTrainingInfo implements TrainingSnapshot {
	readonly generation: NonNegativeInt;
	readonly symbol: TradingSymbol;

	constructor(
		symbol: string,
		private readonly _summary: BestAgentSummary
	) {
		this.symbol = symbol as TradingSymbol;
		this.generation = _summary.generation;
	}

	buildBestAgentSummary(): BestAgentSummary {
		return this._summary;
	}
}
