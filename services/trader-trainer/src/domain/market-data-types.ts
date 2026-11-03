import type {
	BookTickerData,
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "@trading-model/contracts/market-data.types";
import type { Price } from "@trading-model/primitives/primitives";

import { NormalizationStats } from "./normalization-stats";

export {
	fromSymbol,
	type TradingSymbol,
	toSymbol,
} from "@trading-model/primitives/primitives";
export { NormalizationStats };

import { FEATURE_DIM } from "./feature-vector-codec";

export { FEATURE_DIM };

interface CandleNormalizers {
	close: NormalizationStats;
	volume: NormalizationStats;
	open: NormalizationStats;
	high: NormalizationStats;
	low: NormalizationStats;
}

interface TradeNormalizers {
	price: NormalizationStats;
	qty: NormalizationStats;
}

interface BookNormalizers {
	bid: NormalizationStats;
	ask: NormalizationStats;
	spread: NormalizationStats;
}

interface TickerNormalizers {
	volume: NormalizationStats;
}

export interface SymbolNormalizers {
	candle: CandleNormalizers;
	trade: TradeNormalizers;
	book: BookNormalizers;
	ticker: TickerNormalizers;
}

/** A price ticker of one symbol, stamped when the trainer received it. */
export interface PriceSnapshotData {
	price: Price;
	timestamp: number;
}

/**
 * Everything received for a symbol, oldest first. Snapshots are kept as a
 * history, not only the latest: a candle's features may only read what was
 * known at its close (ADR-0030).
 */
export interface BaseSymbolState {
	candles: CandleData[];
	trades: TradeData[];
	/** Reduced to one level per side: the features only read the averages. */
	orderBooks: OrderBookData[];
	bookTickers: BookTickerData[];
	tickers24h: TickerData[];
	prices: PriceSnapshotData[];
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
	/** Trades of the lookback window ending at the candle close. */
	trades: TradeData[];
	orderBook?: OrderBookData;
	bookTicker?: BookTickerData;
	ticker24h?: TickerData;
	price?: Price;
	norm: SymbolNormalizers;
}
