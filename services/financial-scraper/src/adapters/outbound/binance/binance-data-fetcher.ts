import { normalizeError } from "@trading-model/common/utils/errors";
import type { SymbolInterval } from "@trading-model/contracts/candlestick-query";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/logger";
import {
	type Limit,
	PositiveInt,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import { SNAPSHOT_PARTS_FAILED_TOTAL } from "../../../config/metrics";
import type {
	MarketDataSnapshot,
	SnapshotPart,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import {
	get24hrTickerStats,
	getCandlestickData,
	getOrderBook,
	getOrderBookTicker,
	getRecentTrades,
	getSymbolPriceTicker,
} from "./binance.client";
import { BinanceNormalizer } from "./normalizer";

/** Raw answer of each Binance endpoint; absent when that request failed. */
export interface RawBinanceData {
	orderBookRaw?: Awaited<ReturnType<typeof getOrderBook>>;
	tradesRaw?: Awaited<ReturnType<typeof getRecentTrades>>;
	candlesRaw?: Awaited<ReturnType<typeof getCandlestickData>>;
	ticker24hRaw?: Awaited<ReturnType<typeof get24hrTickerStats>>;
	priceTickerRaw?: Awaited<ReturnType<typeof getSymbolPriceTicker>>;
	bookTickerRaw?: Awaited<ReturnType<typeof getOrderBookTicker>>;
}

/** Pod clock may run ahead of Binance's: a still-open candle must not pass for closed (the cursor never goes back). */
const CLOSE_MARGIN_MS = 2000;

type RawKey = keyof RawBinanceData;

/** One request per ticker endpoint for the whole cycle, shared by its symbols. */
export interface TickerBatch {
	ticker24hRaw: Promise<Awaited<ReturnType<typeof get24hrTickerStats>>>;
	priceTickerRaw: Promise<Awaited<ReturnType<typeof getSymbolPriceTicker>>>;
	bookTickerRaw: Promise<Awaited<ReturnType<typeof getOrderBookTicker>>>;
}

/** Starts the three ticker requests of a cycle; over 100 symbols asks for all (Binance caps `symbols` at 100). */
export function fetchTickerBatch(symbols: TradingSymbol[]): TickerBatch {
	const list = symbols.length > 100 ? undefined : symbols;
	const batch = {
		ticker24hRaw: get24hrTickerStats(list),
		priceTickerRaw: getSymbolPriceTicker(list),
		bookTickerRaw: getOrderBookTicker(list),
	};
	// Each symbol reports the failure; none stays unhandled when no symbol reads it.
	void Promise.allSettled(Object.values(batch));
	return batch;
}

/** The rows of one symbol; absent from the batch response is that symbol's error. */
async function rowsOf<Row extends { symbol: string }>(
	batch: Promise<Row[]>,
	symbol: TradingSymbol
): Promise<Row[]> {
	const rows = (await batch).filter((row) => row.symbol === symbol);
	if (rows.length === 0) {
		throw new Error(`${symbol} absent from the ticker response`);
	}
	return rows;
}

const PART_OF: Record<RawKey, SnapshotPart> = {
	orderBookRaw: "orderBook",
	tradesRaw: "recentTrades",
	candlesRaw: "candles",
	ticker24hRaw: "ticker24h",
	priceTickerRaw: "priceTicker",
	bookTickerRaw: "bookTicker",
};

/**
 * Fetches the six endpoints of one symbol. A failed endpoint only leaves its
 * part out of the snapshot (logged, counted): an order book error must not
 * cost the candles. Rejects when every endpoint failed, with the first error
 * (a 451 stays a 451 for the caller).
 */
export async function fetchAllRawData(
	opts: SnapshotRequest,
	tickers?: TickerBatch
): Promise<RawBinanceData> {
	const { symbol, candleLimit, candleStartTime, tradeLimit, orderBookLimit } =
		opts;
	const interval = opts.interval ?? CandleInterval.Min1;
	const requests: Record<RawKey, () => Promise<unknown>> = {
		orderBookRaw: () =>
			getOrderBook({
				symbol,
				limit: orderBookLimit ?? PositiveInt.of(100),
			}),
		tradesRaw: () =>
			getRecentTrades({
				symbol,
				limit: tradeLimit ?? PositiveInt.of(100),
			}),
		candlesRaw: () =>
			getCandlestickData({
				symbol,
				limit: candleLimit ?? (100 as Limit),
				interval,
				startTime: candleStartTime,
			}),
		ticker24hRaw: () =>
			tickers
				? rowsOf(tickers.ticker24hRaw, symbol)
				: get24hrTickerStats([symbol]),
		priceTickerRaw: () =>
			tickers
				? rowsOf(tickers.priceTickerRaw, symbol)
				: getSymbolPriceTicker([symbol]),
		bookTickerRaw: () =>
			tickers
				? rowsOf(tickers.bookTickerRaw, symbol)
				: getOrderBookTicker([symbol]),
	};

	const keys = Object.keys(requests) as RawKey[];
	const settled = await Promise.allSettled(keys.map((key) => requests[key]()));

	const raw: Record<string, unknown> = {};
	const errors: unknown[] = [];
	settled.forEach((outcome, index) => {
		const key = keys[index] as RawKey;
		if (outcome.status === "fulfilled") {
			raw[key] = outcome.value;
			return;
		}
		errors.push(outcome.reason);
		SNAPSHOT_PARTS_FAILED_TOTAL.inc({ part: PART_OF[key] });
		logger.warn("Market data part fetch failed", {
			context: { symbol, part: PART_OF[key] },
			error: normalizeError(outcome.reason),
		});
	});

	if (errors.length === keys.length) {
		throw normalizeError(errors[0]);
	}
	return raw as RawBinanceData;
}

/**
 * Normalizes one part; a payload it cannot read only leaves that part out of
 * the snapshot (logged, counted like a failed fetch), never the whole symbol.
 */
function normalizePart<Part>(
	query: SymbolInterval,
	part: SnapshotPart,
	normalize: () => Part
): Part | undefined {
	try {
		return normalize();
	} catch (error) {
		SNAPSHOT_PARTS_FAILED_TOTAL.inc({ part });
		logger.warn("Market data part normalization failed", {
			context: { symbol: query.symbol, part },
			error: normalizeError(error),
		});
		return undefined;
	}
}

export function buildResponse(
	query: SymbolInterval,
	raw: RawBinanceData
): MarketDataSnapshot {
	const fetchedAt = Date.now();
	const { orderBookRaw, tradesRaw, candlesRaw } = raw;
	const { ticker24hRaw, priceTickerRaw, bookTickerRaw } = raw;
	return {
		orderBook:
			orderBookRaw &&
			normalizePart(query, "orderBook", () =>
				BinanceNormalizer.orderBook(query, orderBookRaw)
			),
		recentTrades:
			tradesRaw &&
			normalizePart(query, "recentTrades", () =>
				BinanceNormalizer.trades(query, tradesRaw)
			),
		// Binance returns the still-open candle last: publishing it would send a
		// partial candle that the next cycle sends again with other values.
		candles:
			candlesRaw &&
			normalizePart(query, "candles", () =>
				BinanceNormalizer.candles(query, candlesRaw).filter(
					(candle) => candle.closeTimestamp + CLOSE_MARGIN_MS < fetchedAt
				)
			),
		ticker24h:
			ticker24hRaw &&
			normalizePart(query, "ticker24h", () =>
				BinanceNormalizer.ticker24h(ticker24hRaw)
			),
		priceTicker:
			priceTickerRaw &&
			normalizePart(query, "priceTicker", () =>
				BinanceNormalizer.priceTicker(priceTickerRaw)
			),
		bookTicker:
			bookTickerRaw &&
			normalizePart(query, "bookTicker", () =>
				BinanceNormalizer.bookTicker(bookTickerRaw)
			),
		fetchedAt,
	};
}
