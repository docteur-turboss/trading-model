import type { CandleData } from "@trading-model/contracts/market-data.types";

import { NormalizationStats } from "@trading-model/model-runtime/features/normalization-stats";

export {
	DAILY_MAX_DATA_AGE_MS,
	DAY_MS,
} from "@trading-model/model-runtime/features/feature-builder";
export type { TradingSymbol } from "@trading-model/primitives/primitives";
export { NormalizationStats };

import type { CandleNormalizers } from "@trading-model/model-runtime/features/feature-builder";

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
