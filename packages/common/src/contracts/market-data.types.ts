import type {
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

/** Supported market data sources / exchanges. */
export enum SourceType {
	Bloomberg = "bloomberg",
	Binance = "binance",
	Nyse = "nyse",
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

/** OHLCV price/volume fields shared by candle and ticker data. */
export interface OhlcvData {
	open: Price;
	high: Price;
	low: Price;
	close: Price;
	volume: Volume;
}

/** Represents a single OHLCV candlestick data point. */
export interface CandleData extends BaseMarketData, OhlcvData {
	trades?: number;
	interval: CandleInterval;
	closeTimestamp: UnixTimestamp;
}

/** Trade direction. */
export enum TradeSide {
	Buy = "buy",
	Sell = "sell",
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
