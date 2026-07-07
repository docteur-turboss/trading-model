import type { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";
import type { Candle, OrderBook, Ticker } from "../types/dtos";
import { request } from "./_request";

export const scraperApi = {
	getCandles: (params: { symbol: TradingSymbol; interval: CandleInterval }) =>
		request<Candle[]>(
			"GET",
			`/scraper/candles?symbol=${params.symbol}&interval=${params.interval}`
		),
	getTickers: (symbol: TradingSymbol) =>
		request<Ticker>("GET", `/scraper/tickers/${symbol}`),
	getOrderBook: (symbol: TradingSymbol) =>
		request<OrderBook>("GET", `/scraper/orderbook/${symbol}`),
};
