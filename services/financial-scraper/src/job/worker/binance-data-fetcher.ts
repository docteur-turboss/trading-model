import { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

import {
	get24hrTickerStats,
	getCandlestickData,
	getOrderBook,
	getOrderBookTicker,
	getRecentTrades,
	getSymbolPriceTicker,
} from "../../clients/binance/binance.client";
import { BinanceNormalizer } from "../../clients/binance/normalizer";
import type {
	BinanceWorkerOptions,
	BinanceWorkerResult,
} from "./binance-worker-types";

export interface RawBinanceData {
	orderBookRaw: Awaited<ReturnType<typeof getOrderBook>>;
	tradesRaw: Awaited<ReturnType<typeof getRecentTrades>>;
	candlesRaw: Awaited<ReturnType<typeof getCandlestickData>>;
	ticker24hRaw: Awaited<ReturnType<typeof get24hrTickerStats>>;
	priceTickerRaw: Awaited<ReturnType<typeof getSymbolPriceTicker>>;
	bookTickerRaw: Awaited<ReturnType<typeof getOrderBookTicker>>;
}

export async function fetchAllRawData(
	opts: BinanceWorkerOptions
): Promise<RawBinanceData> {
	const {
		symbol,
		candleLimit = 100,
		tradeLimit = 100,
		orderBookLimit = 100,
	} = opts;
	const interval = opts.interval ?? CandleInterval.MIN1;

	return _fetchBinanceData(
		symbol,
		interval,
		candleLimit,
		tradeLimit,
		orderBookLimit
	);
}

async function _fetchBinanceData(
	symbol: string,
	interval: string,
	candleLimit: number,
	tradeLimit: number,
	orderBookLimit: number
): Promise<RawBinanceData> {
	const [
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	] = await Promise.all([
		getOrderBook({ symbol, limit: orderBookLimit }),
		getRecentTrades({ symbol, limit: tradeLimit }),
		getCandlestickData({ symbol, limit: candleLimit, interval }),
		get24hrTickerStats([symbol]),
		getSymbolPriceTicker([symbol]),
		getOrderBookTicker([symbol]),
	]);

	return {
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	};
}

export function buildResponse(
	symbol: TradingSymbol,
	interval: CandleInterval | undefined,
	raw: RawBinanceData
): BinanceWorkerResult {
	return {
		orderBook: BinanceNormalizer.orderBook(symbol, raw.orderBookRaw),
		recentTrades: BinanceNormalizer.trades(symbol, raw.tradesRaw),
		candles: BinanceNormalizer.candles(
			symbol,
			interval ?? CandleInterval.MIN1,
			raw.candlesRaw
		),
		ticker24h: BinanceNormalizer.ticker24h(raw.ticker24hRaw),
		priceTicker: BinanceNormalizer.priceTicker(raw.priceTickerRaw),
		bookTicker: BinanceNormalizer.bookTicker(raw.bookTickerRaw),
		fetchedAt: Date.now(),
	};
}
