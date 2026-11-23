import type { CandlestickQuery } from "@trading-model/contracts/candlestick-query";
import type { TradingSymbol } from "@trading-model/primitives/primitives";
import { httpClients } from "../../../config/http";
import type {
	Binance24hrTickerStatsResponse,
	BinanceCandlestickDataResponse,
	BinanceDepthResponse,
	BinanceTradeResponse,
} from "./binance.api";
import { parseCandlestick, type RawBinanceCandlestick } from "./binance.api";
import { BINANCE_ENDPOINTS, type BinanceQueryParams } from "./endpoints";
import { BINANCE_WEIGHTS } from "./weights";

const BINANCE = httpClients.binance;

export async function getOrderBook(
	query: BinanceQueryParams,
	signal?: AbortSignal
): Promise<BinanceDepthResponse> {
	const { symbol, limit = 100 } = query;
	const weight = BINANCE_WEIGHTS.depth(limit);
	const url = BINANCE_ENDPOINTS.depth({ symbol, limit });
	return (await BINANCE.get(url, { weight, signal })).data;
}

export async function getRecentTrades(
	query: BinanceQueryParams,
	signal?: AbortSignal
): Promise<BinanceTradeResponse> {
	const { symbol, limit = 500 } = query;
	const weight = BINANCE_WEIGHTS.trades();
	const url = BINANCE_ENDPOINTS.trades({ symbol, limit });
	return (await BINANCE.get(url, { weight, signal })).data;
}

export async function getCandlestickData(
	query: CandlestickQuery,
	signal?: AbortSignal
): Promise<BinanceCandlestickDataResponse> {
	const { symbol, interval, startTime, limit = 500 } = query;
	const url = BINANCE_ENDPOINTS.candlesticks({
		symbol,
		interval,
		startTime,
		limit,
	});
	const raw = (
		await BINANCE.get(url, { weight: BINANCE_WEIGHTS.candlesticks(), signal })
	).data as unknown[][];
	return raw.map((tuple) => parseCandlestick(tuple as RawBinanceCandlestick));
}

export async function get24hrTickerStats(
	symbol?: TradingSymbol[],
	signal?: AbortSignal
): Promise<Binance24hrTickerStatsResponse> {
	const weight = BINANCE_WEIGHTS.change24hrStats((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.change24hrStats(symbol);
	return (await BINANCE.get(url, { weight, signal })).data;
}
