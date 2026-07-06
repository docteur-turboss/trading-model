export interface BinanceOrderBookEntry {
	price: string; // note : Binance send strings
	qty: string;
}

export interface BinanceDepthResponse {
	lastUpdateId: number;
	bids: [string, string][];
	asks: [string, string][];
}

export interface BinanceTrade {
	id: number;
	price: string;
	qty: string;
	quoteQty: string;
	time: number;
	isBuyerMaker: boolean;
	isBestMatch: boolean;
}

export type BinanceTradeResponse = BinanceTrade[];

export type BinanceHistoricalTrade = BinanceTrade;
export type BinanceHistoricalTradeResponse = BinanceHistoricalTrade[];

export interface BinanceAggregateTrade {
	aggregateTradeId: number; // Aggregate tradeId
	price: string; // Price
	quantity: string; // Quantity
	firstTradeId: number; // First tradeId
	lastTradeId: number; // Last tradeId
	time: number; // Timestamp
	isBuyerMaker: boolean; // Was the buyer the maker?
	isBestMatch: boolean; // Ignore
}

export type BinanceAggregateTradeResponse = BinanceAggregateTrade[];

/** Raw Binance API candlestick tuple (12 positional fields). */
export type BinanceCandlestickTuple = [
	number, // OpenTime
	string, // Open
	string, // High
	string, // Low
	string, // Close
	string, // Volume
	number, // CloseTime
	string, // QuoteAssetVolume
	number, // NumberOfTrades
	string, // TakerBuyBaseAssetVolume
	string, // TakerBuyQuoteAssetVolume
	string, // Ignore
];

/** Parsed candlestick with named fields. */
export interface BinanceCandlestickData {
	openTime: number;
	open: string;
	high: string;
	low: string;
	close: string;
	volume: string;
	closeTime: number;
	quoteAssetVolume: string;
	numberOfTrades: number;
	takerBuyBaseAssetVolume: string;
	takerBuyQuoteAssetVolume: string;
	ignore: string;
}

export type BinanceCandlestickDataResponse = BinanceCandlestickTuple[];

/** Convert a raw API tuple to a named-field object. */
export function parseCandlestick(raw: BinanceCandlestickTuple): BinanceCandlestickData {
	return {
		openTime: raw[0],
		open: raw[1],
		high: raw[2],
		low: raw[3],
		close: raw[4],
		volume: raw[5],
		closeTime: raw[6],
		quoteAssetVolume: raw[7],
		numberOfTrades: raw[8],
		takerBuyBaseAssetVolume: raw[9],
		takerBuyQuoteAssetVolume: raw[10],
		ignore: raw[11],
	};
}

export interface Binance24hrTickerStats {
	symbol: string;
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
	openTime: number;
	closeTime: number;
	firstId: number; // First tradeId
	lastId: number; // Last tradeId
	count: number; // Trade count
}

export type Binance24hrTickerStatsResponse = Binance24hrTickerStats[];

export interface BinanceTradingDayTicker {
	symbol: string;
	priceChange: string;
	priceChangePercent: string;
	weightedAvgPrice: string;
	openPrice: string;
	highPrice: string;
	lowPrice: string;
	lastPrice: string;
	volume: string;
	quoteVolume: string;
	openTime: number;
	closeTime: number;
	firstId: number;
	lastId: number;
	count: number;
}

export type BinanceTradingDayTickerResponse = BinanceTradingDayTicker[];

export interface BinanceSymbolPriceTicker {
	symbol: string;
	price: string;
}

export type BinanceSymbolPriceTickerResponse = BinanceSymbolPriceTicker[];

export interface BinanceSymbolOrderBookTicker {
	symbol: string;
	bidPrice: string;
	askPrice: string;
	bidQty: string;
	askQty: string;
}

export type BinanceSymbolOrderBookTickerResponse =
	BinanceSymbolOrderBookTicker[];
