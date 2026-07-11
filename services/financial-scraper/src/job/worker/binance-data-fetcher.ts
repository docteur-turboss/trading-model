import { CandleInterval } from "@trading-model/common/config/event.types";
import type { Limit } from "@trading-model/common/domain/primitives";

import {
	get24hrTickerStats,
	getCandlestickData,
	getOrderBook,
	getOrderBookTicker,
	getRecentTrades,
	getSymbolPriceTicker,
} from "../../clients/binance/binance.client";
import {
	BinanceNormalizer,
	type CandleQuery,
} from "../../clients/binance/normalizer";
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

export function fetchAllRawData(
	opts: BinanceWorkerOptions
): Promise<RawBinanceData> {
	const { symbol, candleLimit, tradeLimit, orderBookLimit } = opts;
	const interval = opts.interval ?? CandleInterval.Min1;
	const query: CandleQuery = { symbol, interval };

	return _fetchBinanceData(query, candleLimit, tradeLimit, orderBookLimit);
}

async function _fetchBinanceData(
	query: CandleQuery,
	candleLimit: Limit | undefined,
	tradeLimit: Limit | undefined,
	orderBookLimit: Limit | undefined
): Promise<RawBinanceData> {
	const { symbol, interval } = query;
	const [
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	] = await Promise.all([
		getOrderBook({ symbol, limit: orderBookLimit ?? (100 as Limit) }),
		getRecentTrades({ symbol, limit: tradeLimit ?? (100 as Limit) }),
		getCandlestickData({
			symbol,
			limit: candleLimit ?? (100 as Limit),
			interval,
		}),
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
	query: CandleQuery,
	raw: RawBinanceData
): BinanceWorkerResult {
	return {
		orderBook: BinanceNormalizer.orderBook(query, raw.orderBookRaw),
		recentTrades: BinanceNormalizer.trades(query, raw.tradesRaw),
		candles: BinanceNormalizer.candles(query, raw.candlesRaw),
		ticker24h: BinanceNormalizer.ticker24h(raw.ticker24hRaw),
		priceTicker: BinanceNormalizer.priceTicker(raw.priceTickerRaw),
		bookTicker: BinanceNormalizer.bookTicker(raw.bookTickerRaw),
		fetchedAt: Date.now(),
	};
}
