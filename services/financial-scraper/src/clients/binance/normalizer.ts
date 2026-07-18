import { normalizeBookTicker } from "./normalizers/book-ticker";
import { normalizeCandles } from "./normalizers/candles";
import { normalizeOrderBook } from "./normalizers/order-book";
import { normalizePriceTicker } from "./normalizers/price-ticker";
import {
	normalizeTicker24h,
	normalizeTradingDayTicker,
} from "./normalizers/ticker";
import {
	normalizeAggregateTrades,
	normalizeTrades,
} from "./normalizers/trades";

export type { SymbolInterval } from "@trading-model/common/domain/candlestick-query";
export type { SymbolQuery } from "./normalizers/query-types";

export const BinanceNormalizer = {
	orderBook: normalizeOrderBook,
	trades: normalizeTrades,
	aggregateTrades: normalizeAggregateTrades,
	candles: normalizeCandles,
	ticker24h: normalizeTicker24h,
	tradingDayTicker: normalizeTradingDayTicker,
	priceTicker: normalizePriceTicker,
	bookTicker: normalizeBookTicker,
};
