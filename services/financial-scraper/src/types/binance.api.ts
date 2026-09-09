import {
	type TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { OhlcvFields } from "@trading-model/validation/shared/contracts/market-data.types";

/** Binance sends numeric values as strings; these branded types distinguish them at the type level. */
type PriceString = string & { readonly brand: "PriceString" };
type VolumeString = string & { readonly brand: "VolumeString" };
type CashString = string & { readonly brand: "CashString" };
type PriceChangePercentString = string & {
	readonly brand: "PriceChangePercentString";
};

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
	priceChangePercent: PriceChangePercentString;
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
export interface BinanceCandlestickData
	extends OhlcvFields<PriceString, VolumeString> {
	openTime: UnixTimestamp;
	closeTime: UnixTimestamp;
	quoteAssetVolume: CashString;
	numberOfTrades: number;
	takerBuyBaseAssetVolume: VolumeString;
	takerBuyQuoteAssetVolume: CashString;
}

export type BinanceCandlestickDataResponse = BinanceCandlestickData[];

/** Raw candlestick tuple as returned by the Binance REST API (11 positional elements). */
export type RawBinanceCandlestick = [
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
];

/** Convert a raw API tuple to a named-field object. */
export function parseCandlestick(
	raw: RawBinanceCandlestick
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
		openTime: UnixTimestamp.of(openTime as number),
		open: open as PriceString,
		high: high as PriceString,
		low: low as PriceString,
		close: close as PriceString,
		volume: volume as VolumeString,
		closeTime: UnixTimestamp.of(closeTime as number),
		quoteAssetVolume: quoteAssetVolume as CashString,
		numberOfTrades: numberOfTrades as number,
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
