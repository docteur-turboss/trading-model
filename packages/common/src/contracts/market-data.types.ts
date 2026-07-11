import type {
	DurationMs,
	PositiveInt,
	Price,
	TradingSymbol,
	UnixTimestamp,
	Volume,
} from "../domain/primitives";

export {
	getAskTotalQty,
	getAvgAsk,
	getAvgBid,
	getBidTotalQty,
} from "../config/order-book-utils";

/** Supported financial market categories. */
export enum MarketType {
	Crypto = "crypto",
	Equity = "equity",
	Bond = "bond",
	Etf = "etf",
	Fx = "fx",
	Future = "future",
}

export namespace MarketType {
	const AllValues: MarketType[] = Object.values(MarketType).filter(
		(value): value is MarketType => typeof value === "string"
	);

	/** @deprecated Use MarketType.Crypto. */
	export const CRYPTO: MarketType = MarketType.Crypto;
	/** @deprecated Use MarketType.Equity. */
	export const EQUITY: MarketType = MarketType.Equity;
	/** @deprecated Use MarketType.Bond. */
	export const BOND: MarketType = MarketType.Bond;
	/** @deprecated Use MarketType.Etf. */
	export const ETF: MarketType = MarketType.Etf;
	/** @deprecated Use MarketType.Fx. */
	export const FX: MarketType = MarketType.Fx;
	/** @deprecated Use MarketType.Future. */
	export const FUTURE: MarketType = MarketType.Future;

	export function isDecentralized(value: MarketType): boolean {
		return value === MarketType.Crypto;
	}

	export function values(): MarketType[] {
		return Array.from(AllValues);
	}
}

/** @deprecated Use MarketType.isDecentralized() instead. */
export function isMarketDecentralized(value: MarketType): boolean {
	return MarketType.isDecentralized(value);
}

/** @deprecated Use MarketType.values() instead. */
export function marketTypeValues(): MarketType[] {
	return MarketType.values();
}

/** Supported market data sources / exchanges. */
export enum SourceType {
	Bloomberg = "bloomberg",
	Binance = "binance",
	Nyse = "nyse",
}

export namespace SourceType {
	const AllValues: SourceType[] = Object.values(SourceType).filter(
		(value): value is SourceType => typeof value === "string"
	);

	/** @deprecated Use SourceType.Binance. */
	export const BINANCE: SourceType = SourceType.Binance;
	/** @deprecated Use SourceType.Bloomberg. */
	export const BLOOMBERG: SourceType = SourceType.Bloomberg;
	/** @deprecated Use SourceType.Nyse. */
	export const NYSE: SourceType = SourceType.Nyse;

	export function values(): SourceType[] {
		return Array.from(AllValues);
	}
}

/** @deprecated Use SourceType.values() instead. */
export function sourceTypeValues(): SourceType[] {
	return SourceType.values();
}

/** Common fields shared by all market data entities. */
export interface BaseMarketData {
	symbol: TradingSymbol;
	source: SourceType;
	timestamp: UnixTimestamp;
	market: MarketType;
}

/** Supported candlestick intervals. */
export enum CandleInterval {
	S1 = "1s",
	Min1 = "1m",
	Min3 = "3m",
	Min5 = "5m",
	Min15 = "15m",
	Min30 = "30m",
	H1 = "1h",
	H2 = "2h",
	H4 = "4h",
	H6 = "6h",
	H8 = "8h",
	H12 = "12h",
	D1 = "1d",
	D3 = "3d",
	W1 = "1w",
	Month1 = "1M",
}

export namespace CandleInterval {
	const AllValues: CandleInterval[] = Object.values(CandleInterval).filter(
		(value): value is CandleInterval => typeof value === "string"
	);

	const IntervalToMsMap: Record<string, DurationMs> = {
		"1s": 1000 as DurationMs,
		"1m": 60000 as DurationMs,
		"3m": 180000 as DurationMs,
		"5m": 300000 as DurationMs,
		"15m": 900000 as DurationMs,
		"30m": 1800000 as DurationMs,
		"1h": 3600000 as DurationMs,
		"2h": 7200000 as DurationMs,
		"4h": 14400000 as DurationMs,
		"6h": 21600000 as DurationMs,
		"8h": 28800000 as DurationMs,
		"12h": 43200000 as DurationMs,
		"1d": 86400000 as DurationMs,
		"3d": 259200000 as DurationMs,
		"1w": 604800000 as DurationMs,
		"1M": 2592000000 as DurationMs,
	};

	export function toMs(value: CandleInterval): number {
		return IntervalToMsMap[value];
	}

	export function values(): CandleInterval[] {
		return Array.from(AllValues);
	}
}

/** @deprecated Use CandleInterval.toMs() instead. */
export function candleIntervalToMs(value: CandleInterval): number {
	return CandleInterval.toMs(value);
}

/** @deprecated Use CandleInterval.values() instead. */
export function candleIntervalValues(): CandleInterval[] {
	return CandleInterval.values();
}

/** Generic OHLCV fields parameterized by price and volume types. */
export interface OhlcvFields<TPrice, TVolume> {
	open: TPrice;
	high: TPrice;
	low: TPrice;
	close: TPrice;
	volume: TVolume;
}

/** OHLCV price/volume fields shared by candle and ticker data. */
export interface OhlcvData extends OhlcvFields<Price, Volume> {}

/** Represents a single OHLCV candlestick data point. */
export interface CandleData extends BaseMarketData, OhlcvData {
	trades?: PositiveInt;
	interval: CandleInterval;
	closeTimestamp: UnixTimestamp;
}

/** Trade direction. */
export enum TradeSide {
	Buy = "buy",
	Sell = "sell",
}

export namespace TradeSide {
	const AllValues: TradeSide[] = Object.values(TradeSide).filter(
		(value): value is TradeSide => typeof value === "string"
	);

	export function inverse(value: TradeSide): TradeSide {
		return value === TradeSide.Buy ? TradeSide.Sell : TradeSide.Buy;
	}

	export function values(): TradeSide[] {
		return Array.from(AllValues);
	}
}

/** @deprecated Use TradeSide.inverse() instead. */
export function inverseTradeSide(value: TradeSide): TradeSide {
	return TradeSide.inverse(value);
}

/** @deprecated Use TradeSide.values() instead. */
export function tradeSideValues(): TradeSide[] {
	return TradeSide.values();
}

/** Represents an executed trade on a market. */
export interface TradeData extends BaseMarketData, OrderBookLevel {
	tradeId: bigint;
	side: TradeSide;
}

/** A single price level in the order book. */
export interface OrderBookLevel {
	price: Price;
	quantity: Volume;
}

/** Snapshot of the order book depth at a point in time. */
export interface OrderBookData extends BaseMarketData {
	bids: Set<OrderBookLevel>;
	asks: Set<OrderBookLevel>;
}

/** Best bid / ask pair with optional quantities. */
export interface BidAsk {
	bid: Price;
	ask: Price;
	bidQty?: Volume;
	askQty?: Volume;
}

/** Best bid / ask ticker snapshot. */
export interface BookTickerData extends BaseMarketData, BidAsk {
	bidQty: Volume;
	askQty: Volume;
}

/**
 * OHLCV fields as used by 24-hour tickers (uses `last` instead of `close`).
 */
export interface OhlcvTickerData {
	low: Price;
	open: Price;
	high: Price;
	last: Price;
	volume: Volume;
}

/** 24-hour price ticker statistics. */
export interface TickerData extends BaseMarketData, OhlcvTickerData {
	closeTimestamp: UnixTimestamp;
}
