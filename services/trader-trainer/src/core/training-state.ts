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

export class LastTrainingInfo {
	constructor(
		readonly symbol: TradingSymbol,
		readonly bestGenome: DeepReadonly<LamarckGenome>,
		readonly bestFitness: Fitness,
		readonly bestFitnessMeta: GenomeFitnessMeta | undefined,
		readonly generation: PositiveInt,
		readonly generationContext: GenerationContext | null
	) {}

	buildBestAgentSummary(): BestAgentSummary {
		return buildSummary(
			this.bestGenome,
			this.bestFitness,
			this.bestFitnessMeta
		);
	}
}
