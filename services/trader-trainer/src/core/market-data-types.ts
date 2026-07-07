import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/common/config/event.types";

import { NormalizationStats } from "./normalization-stats";

export {
	fromSymbol,
	type TradingSymbol,
	toSymbol,
} from "@trading-model/common/domain/primitives";
export { NormalizationStats };

import { FEATURE_DIM } from "./feature-vector";

export { FEATURE_DIM };

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

/** Fields shared by SymbolState and SymbolStateSerializable. */
export interface BaseSymbolState {
	candles: CandleData[];
	trades: TradeData[];
	orderBook: OrderBookData | null;
	bookTicker: BookTickerData | null;
	ticker24h: TickerData | null;
}

/** Per-symbol state: candles, trades, order book, ticker, and running normalisers. */
export interface SymbolState extends BaseSymbolState {
	norm: SymbolNormalizers;
}
