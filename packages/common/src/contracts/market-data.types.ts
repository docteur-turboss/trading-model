import {
	type TradingSymbol,
	type UnixTimestamp,
	Price,
	Volume,
} from "../domain/primitives";

export {
	getAvgAsk,
	getAvgBid,
	getAskTotalQty,
	getBidTotalQty,
} from "../config/order-book-utils";

/** Supported financial market categories. */
export enum MarketType {
	CRYPTO = "crypto",
	EQUITY = "equity",
	BOND = "bond",
	ETF = "etf",
	FX = "fx",
	FUTURE = "future",
}

/** Supported market data sources / exchanges. */
export enum SourceType {
	BLOOMBERG = "bloomberg",
	BINANCE = "binance",
	NYSE = "nyse",
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
	MIN1 = "1m",
	MIN3 = "3m",
	MIN5 = "5m",
	MIN15 = "15m",
	MIN30 = "30m",
	H1 = "1h",
	H2 = "2h",
	H4 = "4h",
	H6 = "6h",
	H8 = "8h",
	H12 = "12h",
	D1 = "1d",
	D3 = "3d",
	W1 = "1w",
	MONTH1 = "1M",
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
	BUY = "buy",
	SELL = "sell",
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

/** 24-hour price ticker statistics. */
export interface TickerData extends BaseMarketData {
	low: Price;
	open: Price;
	high: Price;
	last: Price;
	volume: Volume;
	closeTimestamp: UnixTimestamp;
}
