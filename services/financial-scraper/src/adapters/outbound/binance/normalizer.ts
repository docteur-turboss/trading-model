import { normalizeBookTicker } from "./normalizers/book-ticker";
import { normalizeCandles } from "./normalizers/candles";
import { normalizeOrderBook } from "./normalizers/order-book";
import { normalizePriceTicker } from "./normalizers/price-ticker";
import { normalizeTicker24h } from "./normalizers/ticker";
import { normalizeTrades } from "./normalizers/trades";

export const BinanceNormalizer = {
	orderBook: normalizeOrderBook,
	trades: normalizeTrades,
	candles: normalizeCandles,
	ticker24h: normalizeTicker24h,
	priceTicker: normalizePriceTicker,
	bookTicker: normalizeBookTicker,
};
