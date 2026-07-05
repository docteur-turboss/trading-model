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

/** Running normalisation statistics grouped by market-data context. */
export interface SymbolNormalizers {
	candleClose: NormalizationStats;
	candleVolume: NormalizationStats;
	candleOpen: NormalizationStats;
	candleHigh: NormalizationStats;
	candleLow: NormalizationStats;
	tradePrice: NormalizationStats;
	tradeQty: NormalizationStats;
	bid: NormalizationStats;
	ask: NormalizationStats;
	spread: NormalizationStats;
	tickerVolume: NormalizationStats;
}

/** Per-symbol state: candles, trades, order book, ticker, and running normalisers. */
export interface SymbolState {
	candles: CandleData[];
	trades: TradeData[];
	orderBook: OrderBookData | null;
	bookTicker: BookTickerData | null;
	ticker24h: TickerData | null;
	norm: SymbolNormalizers;
}
