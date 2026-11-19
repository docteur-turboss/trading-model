import type { CandleData } from "@trading-model/contracts/market-data.types";

import { NormalizationStats } from "./normalization-stats";

export {
	fromSymbol,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
export { NormalizationStats };

/** One day in milliseconds: the length of a daily bar (ADR-0083). */
export const DAY_MS = 86_400_000;

/** A daily bar is fresh over a weekend plus a Monday holiday: Friday's close is still current on Tuesday; also the widest gap inside a daily series. */
export const DAILY_MAX_DATA_AGE_MS = 4 * DAY_MS;

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
