import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

/** A single depth entry with branded types. */
export interface BinanceDepthEntry {
	price: string; // note: Binance sends strings; parsed to Price by normalizer
	qty: string;
}

export interface BinanceDepthResponse {
	lastUpdateId: number;
	bids: BinanceDepthEntry[];
	asks: BinanceDepthEntry[];
}

export interface BinanceTrade {
	id: number;
	price: string;
	qty: string;
	quoteQty: string;
	time: UnixTimestamp;
	isBuyerMaker: boolean;
	isBestMatch: boolean;
}

export type BinanceTradeResponse = BinanceTrade[];

export type BinanceHistoricalTrade = BinanceTrade;
export type BinanceHistoricalTradeResponse = BinanceHistoricalTrade[];

export interface BinanceAggregateTrade {
	aggregateTradeId: number;
	price: string;
	quantity: string;
	firstTradeId: number;
	lastTradeId: number;
	time: UnixTimestamp;
	isBuyerMaker: boolean;
	isBestMatch: boolean;
}

export type BinanceAggregateTradeResponse = BinanceAggregateTrade[];

/** Parsed candlestick with named fields and branded types. */
export interface BinanceCandlestickData {
	openTime: UnixTimestamp;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	closeTime: UnixTimestamp;
	quoteAssetVolume: string;
	numberOfTrades: number;
	takerBuyBaseAssetVolume: string;
	takerBuyQuoteAssetVolume: string;
}

export type BinanceCandlestickDataResponse = BinanceCandlestickData[];

/** Convert a raw API tuple to a named-field object. */
export function parseCandlestick(
	raw: [
		number, string, string, string, string,
		string, number, string, number, string,
		string, string,
	]
): BinanceCandlestickData {
	return {
		openTime: raw[0] as UnixTimestamp,
		open: raw[1],
		high: raw[2],
		low: raw[3],
		close: raw[4],
		volume: raw[5],
		closeTime: raw[6] as UnixTimestamp,
		quoteAssetVolume: raw[7],
		numberOfTrades: raw[8],
		takerBuyBaseAssetVolume: raw[9],
		takerBuyQuoteAssetVolume: raw[10],
	};
}

export interface Binance24hrTickerStats {
	symbol: TradingSymbol;
	priceChange: string;
	priceChangePercent: string;
	weightedAvgPrice: string;
	prevClosePrice: string;
	lastPrice: string;
	bidPrice: string;
	bidQty: string;
	askPrice: string;
	askQty: string;
	openPrice: string;
	highPrice: string;
	lowPrice: string;
	volume: string;
	openTime: UnixTimestamp;
	closeTime: UnixTimestamp;
	firstId: number;
	lastId: number;
	count: number;
}

export type Binance24hrTickerStatsResponse = Binance24hrTickerStats[];

export interface BinanceTradingDayTicker {
	symbol: TradingSymbol;
	priceChange: string;
	priceChangePercent: string;
	weightedAvgPrice: string;
	openPrice: string;
	highPrice: string;
	lowPrice: string;
	lastPrice: string;
	volume: string;
	quoteVolume: string;
	openTime: UnixTimestamp;
	closeTime: UnixTimestamp;
	firstId: number;
	lastId: number;
	count: number;
}

export type BinanceTradingDayTickerResponse = BinanceTradingDayTicker[];

export interface BinanceSymbolPriceTicker {
	symbol: TradingSymbol;
	price: string;
}

export type BinanceSymbolPriceTickerResponse = BinanceSymbolPriceTicker[];

export interface BinanceSymbolOrderBookTicker {
	symbol: TradingSymbol;
	bidPrice: string;
	askPrice: string;
	bidQty: string;
	askQty: string;
}

export type BinanceSymbolOrderBookTickerResponse = BinanceSymbolOrderBookTicker[];
