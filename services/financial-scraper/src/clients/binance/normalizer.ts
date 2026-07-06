import { CandleInterval, TradeSide } from "@trading-model/common/config/event.types";
import {
	Price,
	type TradingSymbol,
	UnixTimestamp,
	Volume,
} from "@trading-model/common/domain/primitives";
import {
	type CandleData,
	MarketType,
	type OrderBookData,
	SourceType,
	type TickerData,
	type TradeData,
} from "../../infra/market-data/market-data.types";
import {
	type Binance24hrTickerStatsResponse,
	type BinanceAggregateTradeResponse,
	type BinanceCandlestickDataResponse,
	type BinanceDepthResponse,
	type BinanceDepthEntry,
	type BinanceHistoricalTradeResponse,
	type BinanceSymbolOrderBookTickerResponse,
	type BinanceSymbolPriceTickerResponse,
	type BinanceTradeResponse,
	type BinanceTradingDayTickerResponse,
} from "../../types/binance.api";

function _parseOrderBookSide(
	entries: BinanceDepthEntry[]
): Set<{ price: Price; quantity: Volume }> {
	return new Set(
		entries.map((entry) => ({
			price: Price.of(Number(entry.price)),
			quantity: Volume.of(Number(entry.qty)),
		}))
	);
}

/** Normalize raw Binance API responses into internal market-data entities. */
export const BinanceNormalizer = {
	/**
	 * Normalize a Binance order book into the internal structure.
	 */
	orderBook(symbol: TradingSymbol, payload: BinanceDepthResponse): OrderBookData {
		return {
			symbol,
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
			bids: _parseOrderBookSide(payload.bids),
			asks: _parseOrderBookSide(payload.asks),
			timestamp: UnixTimestamp.now(),
		};
	},

	/**
	 * Normalize trades (recent + historical).
	 */
	trades(
		symbol: TradingSymbol,
		payload: BinanceTradeResponse | BinanceHistoricalTradeResponse
	): TradeData[] {
		return payload.map((trade) => ({
			symbol,
			tradeId: BigInt(trade.id),
			price: Price.of(Number(trade.price)),
			quantity: Volume.of(Number(trade.qty)),
			timestamp: UnixTimestamp.of(trade.time),
			side: trade.isBuyerMaker ? TradeSide.SELL : TradeSide.BUY,
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
		}));
	},

	/**
	 * Normalize aggregate trades.
	 */
	aggregateTrades(
		symbol: TradingSymbol,
		payload: BinanceAggregateTradeResponse
	): TradeData[] {
		return payload.map((trade) => ({
			symbol,
			tradeId: BigInt(trade.aggregateTradeId),
			price: Price.of(Number(trade.price)),
			quantity: Volume.of(Number(trade.quantity)),
			timestamp: UnixTimestamp.of(trade.time),
			side: trade.isBuyerMaker ? TradeSide.SELL : TradeSide.BUY,
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
		}));
	},

	/**
	 * Normalize candlesticks.
	 */
	candles(
		symbol: TradingSymbol,
		interval: CandleInterval,
		payload: BinanceCandlestickDataResponse
	): CandleData[] {
		return payload.map((candle) => ({
			symbol,
			interval,
			open: Price.of(Number(candle.open)),
			high: Price.of(Number(candle.high)),
			low: Price.of(Number(candle.low)),
			close: Price.of(Number(candle.close)),
			volume: Volume.of(Number(candle.volume)),
			closeTimestamp: UnixTimestamp.of(candle.closeTime),
			trades: candle.numberOfTrades,
			timestamp: UnixTimestamp.of(candle.openTime),
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
		}));
	},

	/**
	 * Normalize 24h ticker.
	 */
	ticker24h(payload: Binance24hrTickerStatsResponse): TickerData[] {
		return payload.map((item) => ({
			market: MarketType.CRYPTO,
			source: SourceType.BINANCE,
			timestamp: UnixTimestamp.of(item.openTime),
			symbol: item.symbol as TradingSymbol,
			open: Price.of(Number(item.openPrice)),
			high: Price.of(Number(item.highPrice)),
			low: Price.of(Number(item.lowPrice)),
			last: Price.of(Number(item.lastPrice)),
			volume: Volume.of(Number(item.volume)),
			closeTimestamp: UnixTimestamp.of(item.closeTime),
		}));
	},

	tradingDayTicker(payload: BinanceTradingDayTickerResponse): TickerData[] {
		return payload.map((item) => ({
			market: MarketType.CRYPTO,
			source: SourceType.BINANCE,
			timestamp: UnixTimestamp.of(item.openTime),
			symbol: item.symbol as TradingSymbol,
			open: Price.of(Number(item.openPrice)),
			high: Price.of(Number(item.highPrice)),
			low: Price.of(Number(item.lowPrice)),
			last: Price.of(Number(item.lastPrice)),
			volume: Volume.of(Number(item.volume)),
			closeTimestamp: UnixTimestamp.of(item.closeTime),
		}));
	},

	priceTicker(
		payload: BinanceSymbolPriceTickerResponse
	): Record<TradingSymbol, Price> {
		return Object.fromEntries(
			payload.map((priceEntry) => [priceEntry.symbol, Price.of(Number(priceEntry.price))])
		);
	},

	/**
	 * Normalise book ticker.
	 */
	bookTicker(payload: BinanceSymbolOrderBookTickerResponse) {
		return payload.map((item) => ({
			symbol: item.symbol as TradingSymbol,
			bid: Price.of(Number(item.bidPrice)),
			ask: Price.of(Number(item.askPrice)),
			bidQty: Volume.of(Number(item.bidQty)),
			askQty: Volume.of(Number(item.askQty)),
		}));
	},
};
