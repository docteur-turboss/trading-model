import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";

import { NormalizationStats } from "./normalization-stats";

export { NormalizationStats };

/** A branded string representing a trading pair symbol (e.g. "BTCUSDT"). */
export type TradingSymbol = string & { readonly brand: unique symbol };

/** Convert a plain string to a TradingSymbol (runtime identity, compile-time type safety). */
export function toSymbol(_symbol: string): TradingSymbol {
	return _symbol as TradingSymbol;
}

/** Convert a TradingSymbol back to a plain string for external use. */
export function fromSymbol(_symbol: TradingSymbol): string {
	return _symbol;
}

/** Number of features produced by buildFeatures per market step. */
export const FEATURE_DIM = 32;

/** Per-symbol state: candles, trades, order book, ticker, and running normalisers. */
export interface SymbolState {
	candles: CandleData[];
	trades: TradeData[];
	orderBook: OrderBookData | null;
	bookTicker: BookTickerData | null;
	ticker24h: TickerData | null;

	closeNorm: NormalizationStats;
	volumeNorm: NormalizationStats;
	openNorm: NormalizationStats;
	highNorm: NormalizationStats;
	lowNorm: NormalizationStats;
	tradePriceNorm: NormalizationStats;
	tradeQtyNorm: NormalizationStats;
	bidNorm: NormalizationStats;
	askNorm: NormalizationStats;
	spreadNorm: NormalizationStats;
	tickerVolumeNorm: NormalizationStats;
}
