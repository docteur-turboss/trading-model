import type { CandlestickQuery } from "@trading-model/contracts/candlestick-query";
import type { TradingSymbol } from "@trading-model/primitives/primitives";
import { httpClients } from "../../../config/http";
import type {
	Binance24hrTickerStatsResponse,
	BinanceCandlestickDataResponse,
	BinanceDepthResponse,
	BinanceSymbolOrderBookTickerResponse,
	BinanceSymbolPriceTickerResponse,
	BinanceTradeResponse,
} from "./binance.api";
import { parseCandlestick, type RawBinanceCandlestick } from "./binance.api";
import { BINANCE_ENDPOINTS, type BinanceQueryParams } from "./endpoints";
import { type ApiWeight, BINANCE_WEIGHTS } from "./weights";

const BINANCE = httpClients.binance;

export async function getOrderBook(
	query: BinanceQueryParams
): Promise<BinanceDepthResponse> {
	const { symbol, limit = 100 } = query;
	const weight = BINANCE_WEIGHTS.depth(limit);
	const url = BINANCE_ENDPOINTS.depth({ symbol, limit });
	return (await BINANCE.get(url, { weight })).data;
}

export async function getRecentTrades(
	query: BinanceQueryParams
): Promise<BinanceTradeResponse> {
	const { symbol, limit = 500 } = query;
	const weight = BINANCE_WEIGHTS.trades();
	const url = BINANCE_ENDPOINTS.trades({ symbol, limit });
	return (await BINANCE.get(url, { weight })).data;
}

export async function getCandlestickData(
	query: CandlestickQuery
): Promise<BinanceCandlestickDataResponse> {
	const { symbol, interval, startTime, limit = 500 } = query;
	const url = BINANCE_ENDPOINTS.candlesticks({
		symbol,
		interval,
		startTime,
		limit,
	});
	const raw = (await _getWithWeight(
		url,
		BINANCE_WEIGHTS.candlesticks()
	)) as unknown[][];
	return raw.map((tuple) => parseCandlestick(tuple as RawBinanceCandlestick));
}

async function _getWithWeight(
	url: string,
	weight: ApiWeight
): Promise<unknown> {
	return (await BINANCE.get(url, { weight })).data;
}

export async function get24hrTickerStats(
	symbol?: TradingSymbol[]
): Promise<Binance24hrTickerStatsResponse> {
	const weight = BINANCE_WEIGHTS.change24hrStats((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.change24hrStats(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

export async function getSymbolPriceTicker(
	symbol?: TradingSymbol[]
): Promise<BinanceSymbolPriceTickerResponse> {
	const weight = BINANCE_WEIGHTS.symbolPriceTicker((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.symbolPriceTicker(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

export async function getOrderBookTicker(
	symbol?: TradingSymbol[]
): Promise<BinanceSymbolOrderBookTickerResponse> {
	const weight = BINANCE_WEIGHTS.orderBookTicker((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.orderBookTicker(symbol);
	return (await BINANCE.get(url, { weight })).data;
}
