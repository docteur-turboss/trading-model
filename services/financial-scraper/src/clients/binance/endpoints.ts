import type { SymbolInterval } from "@trading-model/common/domain/candlestick-query";
import type {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

/** Parameter object for Binance endpoint queries. */
export interface BinanceEndpointQuery {
	symbol?: TradingSymbol;
	limit?: number;
	fromId?: string | number;
	startTime?: UnixTimestamp;
	endTime?: UnixTimestamp;
}

export const BINANCE_ENDPOINTS = {
	depth: (query?: BinanceEndpointQuery): string =>
		query?.symbol && query?.limit
			? `/api/v3/depth?symbol=${query.symbol}&limit=${query.limit}`
			: "/api/v3/depth",

	trades: (query?: BinanceEndpointQuery): string =>
		query?.symbol && query?.limit
			? `/api/v3/trades?symbol=${query.symbol}&limit=${query.limit}`
			: "/api/v3/trades",

	historicalTrades: (query?: BinanceEndpointQuery): string =>
		query?.symbol && query?.limit && query?.fromId
			? `/api/v3/historicalTrades?symbol=${query.symbol}&limit=${query.limit}&fromId=${query.fromId}`
			: "/api/v3/historicalTrades",

	compressedAggregateTrades: (query?: BinanceEndpointQuery): string =>
		query?.symbol && query?.fromId && query?.limit
			? `/api/v3/aggTrades?symbol=${query.symbol}&fromId=${query.fromId}&limit=${query.limit}`
			: "/api/v3/aggTrades",

	candlesticks: (query?: BinanceEndpointQuery & SymbolInterval): string =>
		query?.symbol && query?.interval && query?.startTime && query?.limit
			? `/api/v3/klines?symbol=${query.symbol}&interval=${query.interval}&startTime=${query.startTime}&limit=${query.limit}`
			: "/api/v3/klines",
	/**
	 * 24hr ticker price change statistics.
	 * @param symbol {string[]} - list of symbols to fetch stats for
	 * @returns {string} - the full endpoint
	 */
	change24hrStats: (symbol?: TradingSymbol[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/24hr?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/24hr",
	tradingDayTicker: (symbol?: TradingSymbol[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/tradingDay?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/tradingDay",
	symbolPriceTicker: (symbol?: TradingSymbol[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/price?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/price",
	orderBookTicker: (symbol?: TradingSymbol[]): string =>
		symbol && symbol.length > 0
			? `/api/v3/ticker/bookTicker?symbols=${encodeURIComponent(`[${symbol.map((entry) => `"${entry}"`)}]`)}`
			: "/api/v3/ticker/bookTicker",
};
