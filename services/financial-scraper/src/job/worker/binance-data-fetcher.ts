import { CandleInterval } from "@trading-model/common/config/event.types";
import type { SymbolInterval } from "@trading-model/common/domain/candlestick-query";
import type {
	Limit,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
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

export interface FetchLimits {
	candleLimit?: Limit;
	tradeLimit?: Limit;
	orderBookLimit?: Limit;
}

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
	const query: SymbolInterval = { symbol, interval };
	const limits: FetchLimits = { candleLimit, tradeLimit, orderBookLimit };

	return _fetchBinanceData(query, limits);
}

function _fetchAllRaw(
	query: SymbolInterval,
	limits: FetchLimits
): Promise<
	[
		RawBinanceData["orderBookRaw"],
		RawBinanceData["tradesRaw"],
		RawBinanceData["candlesRaw"],
		RawBinanceData["ticker24hRaw"],
		RawBinanceData["priceTickerRaw"],
		RawBinanceData["bookTickerRaw"],
	]
> {
	const { symbol, interval } = query;
	const { candleLimit, tradeLimit, orderBookLimit } = limits;
	return Promise.all([
		getOrderBook({
			symbol,
			limit: orderBookLimit ?? (100 as unknown as PositiveInt),
		}),
		getRecentTrades({
			symbol,
			limit: tradeLimit ?? (100 as unknown as PositiveInt),
		}),
		getCandlestickData({
			symbol,
			limit: candleLimit ?? (100 as Limit),
			interval,
		}),
		get24hrTickerStats([symbol]),
		getSymbolPriceTicker([symbol]),
		getOrderBookTicker([symbol]),
	]);
}

async function _fetchBinanceData(
	query: SymbolInterval,
	limits: FetchLimits
): Promise<RawBinanceData> {
	const [
		orderBookRaw,
		tradesRaw,
		candlesRaw,
		ticker24hRaw,
		priceTickerRaw,
		bookTickerRaw,
	] = await _fetchAllRaw(query, limits);

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
	query: SymbolInterval,
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
