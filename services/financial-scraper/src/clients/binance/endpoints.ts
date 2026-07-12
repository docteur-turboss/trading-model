import type { SymbolInterval } from "@trading-model/common/domain/candlestick-query";
import type {
	BinanceFromId,
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

/** Parameter object for Binance endpoint queries. */
export interface BinanceEndpointQuery {
	symbol?: TradingSymbol;
	limit?: number;
	fromId?: BinanceFromId;
	startTime?: UnixTimestamp;
	endTime?: UnixTimestamp;
}

function buildUrl(
	path: string,
	params?: Record<string, string | number | undefined>
): string {
	const defined: Record<string, string> = {};
	if (params) {
		for (const [key, value] of Object.entries(params)) {
			if (value !== undefined) {
				defined[key] = String(value);
			}
		}
	}
	const qs = new URLSearchParams(defined).toString();
	return qs ? `${path}?${qs}` : path;
}

function buildArraySymbolQuery(symbols: TradingSymbol[]): string {
	return `[${symbols.map((entry) => `"${entry}"`)}]`;
}

function arraySymbolEndpoint(path: string, symbol?: TradingSymbol[]): string {
	if (!symbol || symbol.length === 0) return path;
	return `${path}?symbols=${encodeURIComponent(buildArraySymbolQuery(symbol))}`;
}

export const BINANCE_ENDPOINTS = {
	depth: (query?: BinanceEndpointQuery): string =>
		buildUrl("/api/v3/depth", {
			symbol: query?.symbol,
			limit: query?.limit,
		}),

	trades: (query?: BinanceEndpointQuery): string =>
		buildUrl("/api/v3/trades", {
			symbol: query?.symbol,
			limit: query?.limit,
		}),

	historicalTrades: (query?: BinanceEndpointQuery): string =>
		buildUrl("/api/v3/historicalTrades", {
			symbol: query?.symbol,
			limit: query?.limit,
			fromId: query?.fromId,
		}),

	compressedAggregateTrades: (query?: BinanceEndpointQuery): string =>
		buildUrl("/api/v3/aggTrades", {
			symbol: query?.symbol,
			fromId: query?.fromId,
			limit: query?.limit,
		}),

	candlesticks: (query?: BinanceEndpointQuery & SymbolInterval): string =>
		buildUrl("/api/v3/klines", {
			symbol: query?.symbol,
			interval: query?.interval,
			startTime: query?.startTime,
			limit: query?.limit,
		}),

	change24hrStats: (symbol?: TradingSymbol[]): string =>
		arraySymbolEndpoint("/api/v3/ticker/24hr", symbol),

	tradingDayTicker: (symbol?: TradingSymbol[]): string =>
		arraySymbolEndpoint("/api/v3/ticker/tradingDay", symbol),

	symbolPriceTicker: (symbol?: TradingSymbol[]): string =>
		arraySymbolEndpoint("/api/v3/ticker/price", symbol),

	orderBookTicker: (symbol?: TradingSymbol[]): string =>
		arraySymbolEndpoint("/api/v3/ticker/bookTicker", symbol),
};
