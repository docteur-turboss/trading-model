import type { CandleData } from "@trading-model/contracts/market-data.types";

import { NormalizationStats } from "./normalization-stats";

export {
	fromSymbol,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
export { NormalizationStats };

import { FEATURE_DIM } from "@trading-model/model-runtime/feature-vector-codec";

export { FEATURE_DIM };

interface CandleNormalizers {
	close: NormalizationStats;
	volume: NormalizationStats;
	open: NormalizationStats;
	high: NormalizationStats;
	low: NormalizationStats;
}

export interface SymbolNormalizers {
	candle: CandleNormalizers;
}

/** The candle window of a symbol, oldest first (ADR-0044). */
export interface BaseSymbolState {
	candles: CandleData[];
}

export interface SymbolState extends BaseSymbolState {
	norm: SymbolNormalizers;
}

/**
 * What a candle's features read: the data known at its close, normalised with
 * statistics of that data only (ADR-0030).
 */
export interface FeatureState {
	candles: CandleData[];
	norm: SymbolNormalizers;
}
