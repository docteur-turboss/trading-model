import type { CandleInterval } from "@trading-model/common/config/event.types";
import {
	type CandleData,
	MarketType,
	type OrderBookData,
	SourceType,
	type TickerData,
	type TradeData,
} from "../../infra/market-data/market-data.types";
import type {
	Binance24hrTickerStatsResponse,
	BinanceAggregateTradeResponse,
	BinanceCandlestickDataResponse,
	BinanceDepthResponse,
	BinanceHistoricalTradeResponse,
	BinanceSymbolOrderBookTickerResponse,
	BinanceSymbolPriceTickerResponse,
	BinanceTradeResponse,
	BinanceTradingDayTickerResponse,
} from "../../types/binance.api";

/** Normalize raw Binance API responses into internal market-data entities. */
export const BinanceNormalizer = {
	/**
	 * Normalize a Binance order book into the internal structure.
	 */
	orderBook(symbol: string, payload: BinanceDepthResponse): OrderBookData {
		const bids = new Set(
			payload.bids.map(([price, qty]) => ({
				price: Number(price),
				quantity: Number(qty),
			}))
		);

		const asks = new Set(
			payload.asks.map(([price, qty]) => ({
				price: Number(price),
				quantity: Number(qty),
			}))
		);

		return {
			symbol,
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
			bids: bids,
			asks: asks,
			timestamp: Date.now(),
		};
	},

	/**
	 * Normalize trades (recent + historical).
	 */
	trades(
		symbol: string,
		payload: BinanceTradeResponse | BinanceHistoricalTradeResponse
	): TradeData[] {
		return payload.map((trade) => ({
			symbol,
			tradeId: BigInt(trade.id),
			price: Number(trade.price),
			quantity: Number(trade.qty),
			timestamp: trade.time,
			side: trade.isBuyerMaker ? "sell" : "buy",
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
		}));
	},

	/**
	 * Normalize aggregate trades.
	 */
	aggregateTrades(
		symbol: string,
		payload: BinanceAggregateTradeResponse
	): TradeData[] {
		return payload.map((trade) => ({
			symbol,
			tradeId: BigInt(trade.aggregateTradeId),
			price: Number(trade.price),
			quantity: Number(trade.quantity),
			timestamp: trade.time,
			side: trade.isBuyerMaker ? "sell" : "buy",
			source: SourceType.BINANCE,
			market: MarketType.CRYPTO,
		}));
	},

	/**
	 * Normalize candlesticks.
	 */
	candles(
		symbol: string,
		interval: CandleInterval,
		payload: BinanceCandlestickDataResponse
	): CandleData[] {
		return payload.map((candle) => ({
			symbol,
			interval,
			open: Number(candle[1]),
			high: Number(candle[2]),
			low: Number(candle[3]),
			close: Number(candle[4]),
			volume: Number(candle[5]),
			closeTimestamp: Number(candle[6]),
			trades: candle[8],
			timestamp: candle[0],
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
			timestamp: item.openTime,
			symbol: item.symbol,
			open: Number(item.openPrice),
			high: Number(item.highPrice),
			low: Number(item.lowPrice),
			last: Number(item.lastPrice),
			volume: Number(item.volume),
			closeTimestamp: item.closeTime,
		}));
	},

	tradingDayTicker(payload: BinanceTradingDayTickerResponse): TickerData[] {
		return payload.map((item) => ({
			market: MarketType.CRYPTO,
			source: SourceType.BINANCE,
			timestamp: item.openTime,
			symbol: item.symbol,
			open: Number(item.openPrice),
			high: Number(item.highPrice),
			low: Number(item.lowPrice),
			last: Number(item.lastPrice),
			volume: Number(item.volume),
			closeTimestamp: item.closeTime,
		}));
	},

	priceTicker(
		payload: BinanceSymbolPriceTickerResponse
	): Record<string, number> {
		return Object.fromEntries(
			payload.map((priceEntry) => [priceEntry.symbol, Number(priceEntry.price)])
		);
	},

	/**
	 * Normalise book ticker.
	 */
	bookTicker(payload: BinanceSymbolOrderBookTickerResponse) {
		return payload.map((item) => ({
			symbol: item.symbol,
			bid: Number(item.bidPrice),
			ask: Number(item.askPrice),
			bidQty: Number(item.bidQty),
			askQty: Number(item.askQty),
		}));
	},
};
