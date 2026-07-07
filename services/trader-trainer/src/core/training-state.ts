import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	ActivationType,
	FitnessType,
	GenomeFitnessMeta,
	SelectionType,
} from "./genetic-algorithm/genome";
import type { LamarckGenome } from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import { GenomeSummaryBuilder } from "./genome-summary-builder";
import type { TradingSymbol } from "./market-data-types";

/** Summary of the best trained agent for API responses. */
export interface BestAgentSummary {
	id: string;
	generation: number;
	fitness: number;
	sharpe: number;
	avgPnl: number;
	negFlops: number;
	complexityPenalty: number;
	gaControl: {
		populationSize: number;
		elitismFraction: number;
		survivorFraction: number;
		episodesPerIndividual: number;
		selectionType: SelectionType;
		fitnessType: FitnessType;
	};
	network: {
		inputDim: number;
		outputDim: number;
		hiddenLayers: { neurons: number; activation: ActivationType }[];
	};
	rl: {
		gamma: number;
		learningRate: number;
		epsilonStart: number;
		epsilonMin: number;
		epsilonDecay: number;
	};
}

export interface LastTrainingInfo {
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: number;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: number;
	generationContext: GenerationContext | null;
}

export function buildBestAgentSummary(
	info: LastTrainingInfo,
	builder: GenomeSummaryBuilder
): BestAgentSummary {
	return builder.build(info.bestGenome, info.bestFitness, info.bestFitnessMeta);
}
