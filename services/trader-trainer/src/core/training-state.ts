import type {
	Fitness,
	Percentage,
	PositiveInt,
	Probability,
	SharpeRatio,
} from "@trading-model/common/domain/primitives";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	ActivationType,
	FitnessType,
	GenomeFitnessMeta,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { buildSummary } from "./genome-summary-builder";
import type { TradingSymbol } from "./market-data-types";

/** Summary of the best trained agent for API responses. */
export interface BestAgentSummary {
	id: string;
	generation: PositiveInt;
	fitness: Fitness;
	sharpe: SharpeRatio;
	avgPnl: number;
	negFlops: number;
	complexityPenalty: number;
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

export interface LastTrainingInfoData {
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: Fitness;
	bestFitnessMeta: GenomeFitnessMeta | undefined;
	generation: PositiveInt;
	generationContext: GenerationContext | null;
}

export interface TrainingSnapshot {
	readonly symbol: TradingSymbol;
	readonly generation: PositiveInt;
	readonly generationContext: GenerationContext | null;
	buildBestAgentSummary(): BestAgentSummary | null;
}

export class NullLastTrainingInfo implements TrainingSnapshot {
	readonly symbol: TradingSymbol = "" as TradingSymbol;
	readonly generation: PositiveInt = 0 as unknown as PositiveInt;
	readonly generationContext: GenerationContext | null = null;

	buildBestAgentSummary(): BestAgentSummary | null {
		return null;
	}
}

export class LastTrainingInfo implements TrainingSnapshot {
	readonly symbol: TradingSymbol;
	readonly bestGenome: DeepReadonly<LamarckGenome>;
	readonly bestFitness: Fitness;
	readonly bestFitnessMeta: GenomeFitnessMeta | undefined;
	readonly generation: PositiveInt;
	readonly generationContext: GenerationContext | null;

	constructor(data: LastTrainingInfoData) {
		this.symbol = data.symbol;
		this.bestGenome = data.bestGenome;
		this.bestFitness = data.bestFitness;
		this.bestFitnessMeta = data.bestFitnessMeta;
		this.generation = data.generation;
		this.generationContext = data.generationContext;
	}

	buildBestAgentSummary(): BestAgentSummary | null {
		return buildSummary(
			this.bestGenome,
			this.bestFitness,
			this.bestFitnessMeta
		);
	}
}
