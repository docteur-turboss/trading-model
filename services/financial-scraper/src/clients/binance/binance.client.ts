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
import { BINANCE_ENDPOINTS } from "./endpoints";
import { BINANCE_WEIGHTS } from "./weights";

const BINANCE = httpClients.binance;

function assertNonEmptySymbol(symbol: string, context: string): void {
	if (!symbol || symbol.trim().length === 0) {
		throw new Error(`${context}: symbol must be a non-empty string`);
	}
}

/**
 * Fetch order book
 * Weight varies by limit:
 *  - 1–100 → 5
 *  - 101–500 → 25
 *  - 501–1000 → 50
 *  - 1001–5000 → 250
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @returns {Promise<BinanceDepthResponse>}
 */
export async function getOrderBook(
	symbol: string,
	limit = 100
): Promise<BinanceDepthResponse> {
	assertNonEmptySymbol(symbol, "getOrderBook");
	const weight = BINANCE_WEIGHTS.depth(limit);
	const url = BINANCE_ENDPOINTS.depth(limit, symbol);
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch recent trades
 * Weight: 25
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @returns {Promise<BinanceTradeResponse>}
 */
export async function getRecentTrades(
	symbol: string,
	limit = 500
): Promise<BinanceTradeResponse> {
	assertNonEmptySymbol(symbol, "getRecentTrades");
	const weight = BINANCE_WEIGHTS.trades();
	const url = BINANCE_ENDPOINTS.trades(limit, symbol);
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch historical trades
 * Weight: 25
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param fromId {string|number} - trade ID from which to start fetching
 * @returns {Promise<BinanceHistoricalTradeResponse>}
 */
export async function getHistoricalTrades(
	symbol: string,
	limit: number,
	fromId: number | string
): Promise<BinanceHistoricalTradeResponse> {
	assertNonEmptySymbol(symbol, "getHistoricalTrades");
	const url = BINANCE_ENDPOINTS.historicalTrades(limit, symbol, fromId);
	const weight = BINANCE_WEIGHTS.historicalTrades();
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch candlestick data
 * Weight: 2.
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param interval {"1s"|"1m"|"3m"|"5m"|"15m"|"30m"|"1h"|"2h"|"4h"|"6h"|"8h"|"12h"|"1d"|"3d"|"1w"|"1M"} - candlestick interval
 * @param startTime {number} - timestamp in ms to start from (inclusive)
 * @returns {Promise<BinanceCandlestickDataResponse>}
 */
export async function getCandlestickData(
	symbol: string,
	limit: number,
	interval:
		| "1s"
		| "1m"
		| "3m"
		| "5m"
		| "15m"
		| "30m"
		| "1h"
		| "2h"
		| "4h"
		| "6h"
		| "8h"
		| "12h"
		| "1d"
		| "3d"
		| "1w"
		| "1M",
	startTime?: number
): Promise<BinanceCandlestickDataResponse> {
	assertNonEmptySymbol(symbol, "getCandlestickData");
	const url = BINANCE_ENDPOINTS.candlesticks(
		symbol,
		interval,
		startTime,
		limit
	);
	const weight = BINANCE_WEIGHTS.candlesticks();
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch compressed aggregate trades
 * Weight : 4.
 * @param symbol {string} - the symbol to fetch (e.g., BTCUSDT)
 * @param limit {number} - maximum 500 - 1000
 * @param fromId {string|number} - trade ID from which to start fetching
 * @param startTime {number} - timestamp in ms to start from (inclusive)
 * @returns {Promise<BinanceAggregateTradeResponse>}
 */
export async function getCompressedAggregateTrades(
	symbol: string,
	fromId: string | number,
	limit = 500
): Promise<BinanceAggregateTradeResponse> {
	assertNonEmptySymbol(symbol, "getCompressedAggregateTrades");
	const url = BINANCE_ENDPOINTS.compressedAggregateTrades(
		symbol,
		fromId,
		limit
	);
	const weight = BINANCE_WEIGHTS.compressedAggregateTrades();
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch 24hr ticker stats
 * Weight varies by number of symbols:
 *  - up to 20 symbols → 2
 *  - 21–100 symbols → 40
 *  - more than 100 symbols → 80
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns
 */
export async function get24hrTickerStats(
	symbol?: string[]
): Promise<Binance24hrTickerStatsResponse> {
	if (symbol) {
		symbol.forEach((sym) => {
			assertNonEmptySymbol(sym, "get24hrTickerStats");
		});
	}
	const weight = BINANCE_WEIGHTS.change24hrStats((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.change24hrStats(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch 24hr ticker stats
 * Weight varies by number of symbols:
 *  - up to 50 symbols → 4 * number of symbols
 *  - less than 100 symbols → 200
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns
 */
export async function getTradingDayTicker(
	symbol: string[]
): Promise<BinanceTradingDayTickerResponse> {
	symbol.forEach((sym) => {
		assertNonEmptySymbol(sym, "getTradingDayTicker");
	});
	const weight = BINANCE_WEIGHTS.tradingDayTicker(symbol.length);
	const url = BINANCE_ENDPOINTS.tradingDayTicker(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch symbol price ticker
 * Weight: 4.
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns {Promise<BinanceSymbolPriceTickerResponse>}
 */
export async function getSymbolPriceTicker(
	symbol?: string[]
): Promise<BinanceSymbolPriceTickerResponse> {
	if (symbol) {
		symbol.forEach((sym) => {
			assertNonEmptySymbol(sym, "getSymbolPriceTicker");
		});
	}
	const weight = BINANCE_WEIGHTS.symbolPriceTicker((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.symbolPriceTicker(symbol);
	return (await BINANCE.get(url, { weight })).data;
}

/**
 * Fetch order book ticker
 * Weight: 4.
 * @param symbol {string[]} - the symbols to fetch (e.g., ["BTCUSDT"])
 * @returns {Promise<BinanceSymbolPriceTickerResponse>}
 */
export async function getOrderBookTicker(
	symbol?: string[]
): Promise<BinanceSymbolOrderBookTickerResponse> {
	if (symbol) {
		symbol.forEach((sym) => {
			assertNonEmptySymbol(sym, "getOrderBookTicker");
		});
	}
	const weight = BINANCE_WEIGHTS.orderBookTicker((symbol ?? []).length);
	const url = BINANCE_ENDPOINTS.orderBookTicker(symbol);
	return (await BINANCE.get(url, { weight })).data;
} // 205
