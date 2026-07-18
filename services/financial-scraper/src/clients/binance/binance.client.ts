import type { CandlestickQuery } from "@trading-model/common/domain/candlestick-query";
import type {
	BinanceFromId,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { httpClients } from "../../config/http";
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
import {
	parseCandlestick,
	type RawBinanceCandlestick,
} from "../../types/binance.api";
import { BINANCE_ENDPOINTS, type BinanceQueryParams } from "./endpoints";
import { type ApiWeight, BINANCE_WEIGHTS } from "./weights";

const BINANCE = httpClients.binance;

/** Parameter object for Binance trade queries (historical or aggregate). */
export interface BinanceTradeQuery extends BinanceQueryParams {
	fromId: BinanceFromId;
}

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

export async function getHistoricalTrades(
	query: BinanceTradeQuery
): Promise<BinanceHistoricalTradeResponse> {
	const { symbol, limit, fromId } = query;
	const weight = BINANCE_WEIGHTS.historicalTrades();
	const url = BINANCE_ENDPOINTS.historicalTrades({ symbol, limit, fromId });
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

export async function getCompressedAggregateTrades(
	query: BinanceTradeQuery
): Promise<BinanceAggregateTradeResponse> {
	const { symbol, fromId, limit = 500 } = query;
	const weight = BINANCE_WEIGHTS.compressedAggregateTrades();
	const url = BINANCE_ENDPOINTS.compressedAggregateTrades({
		symbol,
		fromId,
		limit,
	});
	return (await BINANCE.get(url, { weight })).data;
}

export async function get24hrTickerStats(
	symbol?: TradingSymbol[]
): Promise<Binance24hrTickerStatsResponse> {
	const weight = BINANCE_WEIGHTS.change24hrStats((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.change24hrStats(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

export async function getTradingDayTicker(
	symbol: TradingSymbol[]
): Promise<BinanceTradingDayTickerResponse> {
	const weight = BINANCE_WEIGHTS.tradingDayTicker(symbol.length);
	const url = BINANCE_ENDPOINTS.tradingDayTicker(symbol);
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
