import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";

import { NormalizationStats } from "./normalization-stats";

export { NormalizationStats };

export {
	type TradingSymbol,
	toSymbol,
	fromSymbol,
} from "@trading-model/common/domain/primitives";

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
