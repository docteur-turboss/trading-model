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

import { FEATURE_DIM } from "./feature-vector-codec";

export { FEATURE_DIM };

export interface CandleNormalizers {
	close: NormalizationStats;
	volume: NormalizationStats;
	open: NormalizationStats;
	high: NormalizationStats;
	low: NormalizationStats;
}

export interface TradeNormalizers {
	price: NormalizationStats;
	qty: NormalizationStats;
}

export interface BookNormalizers {
	bid: NormalizationStats;
	ask: NormalizationStats;
	spread: NormalizationStats;
}

export interface TickerNormalizers {
	volume: NormalizationStats;
}

export interface SymbolNormalizers {
	candle: CandleNormalizers;
	trade: TradeNormalizers;
	book: BookNormalizers;
	ticker: TickerNormalizers;
}

export interface BaseSymbolState {
	candles: CandleData[];
	trades: TradeData[];
	orderBook?: OrderBookData;
	bookTicker?: BookTickerData;
	ticker24h?: TickerData;
}

export interface SymbolState extends BaseSymbolState {
	norm: SymbolNormalizers;
}
