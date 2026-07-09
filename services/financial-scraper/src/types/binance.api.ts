import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

/** Binance sends numeric values as strings; these branded types distinguish them at the type level. */
type PriceString = string & { readonly brand: "PriceString" };
type VolumeString = string & { readonly brand: "VolumeString" };
type CashString = string & { readonly brand: "CashString" };

/** A single depth entry with branded types. */
export interface BinanceDepthEntry {
	price: PriceString;
	qty: VolumeString;
}

export interface BinanceDepthResponse {
	lastUpdateId: number;
	bids: BinanceDepthEntry[];
	asks: BinanceDepthEntry[];
}

export interface BinanceTrade {
	id: number;
	price: PriceString;
	qty: VolumeString;
	quoteQty: CashString;
	time: UnixTimestamp;
	isBuyerMaker: boolean;
	isBestMatch: boolean;
}

export type BinanceTradeResponse = BinanceTrade[];

export type BinanceHistoricalTrade = BinanceTrade;
export type BinanceHistoricalTradeResponse = BinanceHistoricalTrade[];

export interface BinanceAggregateTrade {
	aggregateTradeId: number;
	price: PriceString;
	quantity: VolumeString;
	firstTradeId: number;
	lastTradeId: number;
	time: UnixTimestamp;
	isBuyerMaker: boolean;
	isBestMatch: boolean;
}

export type BinanceAggregateTradeResponse = BinanceAggregateTrade[];

/** OHLCV + last price fields shared by Binance ticker responses (all strings as received from API). */
export interface BinanceTickerBaseStats {
	symbol: TradingSymbol;
	priceChange: PriceString;
	priceChangePercent: string;
	weightedAvgPrice: PriceString;
	lastPrice: PriceString;
	openPrice: PriceString;
	highPrice: PriceString;
	lowPrice: PriceString;
	volume: VolumeString;
	openTime: UnixTimestamp;
	closeTime: UnixTimestamp;
	firstId: number;
	lastId: number;
	count: number;
}

/** Parsed candlestick with named fields and branded types. */
export interface BinanceCandlestickData {
	openTime: UnixTimestamp;
	open: PriceString;
	high: PriceString;
	low: PriceString;
	close: PriceString;
	volume: VolumeString;
	closeTime: UnixTimestamp;
	quoteAssetVolume: CashString;
	numberOfTrades: number;
	takerBuyBaseAssetVolume: VolumeString;
	takerBuyQuoteAssetVolume: CashString;
}

export type BinanceCandlestickDataResponse = BinanceCandlestickData[];

/** Convert a raw API tuple to a named-field object. */
export function parseCandlestick(
	raw: [
		openTime: number,
		open: string,
		high: string,
		low: string,
		close: string,
		volume: string,
		closeTime: number,
		quoteAssetVolume: string,
		numberOfTrades: number,
		takerBuyBaseAssetVolume: string,
		takerBuyQuoteAssetVolume: string,
		_takerBuyQuoteAssetVolume: string,
	]
): BinanceCandlestickData {
	const [
		openTime,
		open,
		high,
		low,
		close,
		volume,
		closeTime,
		quoteAssetVolume,
		numberOfTrades,
		takerBuyBaseAssetVolume,
		takerBuyQuoteAssetVolume,
	] = raw;
	return {
		openTime: openTime as UnixTimestamp,
		open: open as PriceString,
		high: high as PriceString,
		low: low as PriceString,
		close: close as PriceString,
		volume: volume as VolumeString,
		closeTime: closeTime as UnixTimestamp,
		quoteAssetVolume: quoteAssetVolume as CashString,
		numberOfTrades,
		takerBuyBaseAssetVolume: takerBuyBaseAssetVolume as VolumeString,
		takerBuyQuoteAssetVolume: takerBuyQuoteAssetVolume as CashString,
	};
}

export interface Binance24hrTickerStats extends BinanceTickerBaseStats {
	prevClosePrice: PriceString;
	bidPrice: PriceString;
	bidQty: VolumeString;
	askPrice: PriceString;
	askQty: VolumeString;
}

export type Binance24hrTickerStatsResponse = Binance24hrTickerStats[];

export interface BinanceTradingDayTicker extends BinanceTickerBaseStats {
	quoteVolume: CashString;
}

export type BinanceTradingDayTickerResponse = BinanceTradingDayTicker[];

export interface BinanceSymbolPriceTicker {
	symbol: TradingSymbol;
	price: PriceString;
}

export type BinanceSymbolPriceTickerResponse = BinanceSymbolPriceTicker[];

export interface BinanceSymbolOrderBookTicker {
	symbol: TradingSymbol;
	bidPrice: PriceString;
	askPrice: PriceString;
	bidQty: VolumeString;
	askQty: VolumeString;
}

export type BinanceSymbolOrderBookTickerResponse =
	BinanceSymbolOrderBookTicker[];
