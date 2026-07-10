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
	candle: {
		close: NormalizationStats;
		volume: NormalizationStats;
		open: NormalizationStats;
		high: NormalizationStats;
		low: NormalizationStats;
	};
	trade: {
		price: NormalizationStats;
		qty: NormalizationStats;
	};
	book: {
		bid: NormalizationStats;
		ask: NormalizationStats;
		spread: NormalizationStats;
	};
	ticker: {
		volume: NormalizationStats;
	};
}

/** Fields shared by SymbolState and SymbolStateSerializable. */
export interface BaseSymbolState {
	candles: CandleData[];
	trades: TradeData[];
	orderBook?: OrderBookData;
	bookTicker?: BookTickerData;
	ticker24h?: TickerData;
}

/** Per-symbol state: candles, trades, order book, ticker, and running normalisers. */
export interface SymbolState extends BaseSymbolState {
	norm: SymbolNormalizers;
}
