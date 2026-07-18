import type {
	Fitness,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import type { GenerationContext } from "./genetic-algorithm/ga-runner";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
} from "./genetic-algorithm/genome-types";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { TradingSymbol } from "./market-data-types";

export interface TrainingSuccess {
	success: true;
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: Fitness;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: PositiveInt;
	generationContext: GenerationContext | null;
}

export interface TrainingFailure {
	success: false;
	symbol: TradingSymbol;
	error: Error;
}

export type TrainingResult = TrainingSuccess | TrainingFailure;
