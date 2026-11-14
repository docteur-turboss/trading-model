import type {
	Fitness,
	NonNegativeInt,
} from "@trading-model/primitives/primitives";
import type {
	GenomeFitnessMeta,
	LamarckGenome,
} from "./genetic-algorithm/genome";
import type { DeepReadonly } from "./genetic-algorithm/shared-types";
import type { TradingSymbol } from "./market-data-types";

export interface TrainingSuccess {
	success: true;
	symbol: TradingSymbol;
	bestGenome: DeepReadonly<LamarckGenome>;
	bestFitness: Fitness;
	bestFitnessMeta?: GenomeFitnessMeta;
	generation: NonNegativeInt;
}

export interface TrainingFailure {
	success: false;
	symbol: TradingSymbol;
	error: Error;
}

export type TrainingResult = TrainingSuccess | TrainingFailure;
