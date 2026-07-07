import { normalizeOrderBook } from "./normalizers/order-book";
import { normalizeTrades, normalizeAggregateTrades } from "./normalizers/trades";
import { normalizeCandles } from "./normalizers/candles";
import { normalizeTicker24h, normalizeTradingDayTicker } from "./normalizers/ticker";
import { normalizePriceTicker } from "./normalizers/price-ticker";
import { normalizeBookTicker } from "./normalizers/book-ticker";

export type { SymbolQuery, CandleQuery } from "./normalizers/query-types";

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
