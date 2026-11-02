import type { CandleData } from "@trading-model/contracts/market-data.types";
import type { FeatureVector } from "./feature-vector";
import type { FeatureState } from "./market-data-types";

/** Base context shared by all feature builder functions. */
export interface FeatureContext {
	features: FeatureVector;
	state: FeatureState;
	idx: number;
}

export interface CandleFeatureContext extends FeatureContext {
	prev?: CandleData;
}

export interface FeatureBuilderContext {
	/** What was known at the close of candle `idx` (ADR-0030). */
	state: FeatureState;
	idx: number;
}
