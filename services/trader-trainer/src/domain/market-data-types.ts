import type { CandleData } from "@trading-model/contracts/market-data.types";

import { NormalizationStats } from "@trading-model/model-runtime/features/normalization-stats";

export {
	fromSymbol,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
export { NormalizationStats };

/** One day in milliseconds: the length of a daily bar (ADR-0083). */
export const DAY_MS = 86_400_000;

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
