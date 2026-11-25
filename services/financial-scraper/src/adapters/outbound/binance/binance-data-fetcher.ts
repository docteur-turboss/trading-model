import { normalizeError } from "@trading-model/common/utils/errors";
import type { SymbolInterval } from "@trading-model/contracts/candlestick-query";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/logger";
import {
	type Limit,
	PositiveInt,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import type { AxiosError } from "axios";
import {
	CANDLES_REJECTED_TOTAL,
	SNAPSHOT_PARTS_FAILED_TOTAL,
} from "../../../config/metrics";
import type {
	MarketDataSnapshot,
	SnapshotPart,
	SnapshotRequest,
} from "../../../domain/market-data-snapshot";
import { dropPriceJumps } from "../../../domain/price-jump";
import {
	get24hrTickerStats,
	getCandlestickData,
	getOrderBook,
} from "./binance.client";
import { normalizeCandles } from "./normalizers/candles";
import { normalizeOrderBook } from "./normalizers/order-book";
import { normalizeTicker24h } from "./normalizers/ticker";

/** Raw answer of each Binance endpoint; absent when that request failed. */
export interface RawBinanceData {
	orderBookRaw?: Awaited<ReturnType<typeof getOrderBook>>;
	candlesRaw?: Awaited<ReturnType<typeof getCandlestickData>>;
	ticker24hRaw?: Awaited<ReturnType<typeof get24hrTickerStats>>;
}

/** HTTP status and `Retry-After` of a 429 (weight limit), 418 (IP ban) or 451 (restricted location) error, else undefined: each further call extends a ban. */
export function banOf(
	error: unknown
): { status: number; retryAfter?: string } | undefined {
	const response = (error as AxiosError | undefined)?.response;
	return response?.status === 429 ||
		response?.status === 418 ||
		response?.status === 451
		? { status: response.status, retryAfter: response.headers?.["retry-after"] }
		: undefined;
}

/** Pod clock may run ahead of Binance's: a still-open candle must not pass for closed (the cursor never goes back). */
const CLOSE_MARGIN_MS = 2000;

type RawKey = keyof RawBinanceData;

/** One request per ticker endpoint for the whole cycle, shared by its symbols. */
export interface TickerBatch {
	ticker24hRaw: Promise<Awaited<ReturnType<typeof get24hrTickerStats>>>;
}

/** Starts the ticker request of a cycle; over 100 symbols asks for all (Binance caps `symbols` at 100). */
export function fetchTickerBatch(
	symbols: TradingSymbol[],
	signal?: AbortSignal
): TickerBatch {
	const list = symbols.length > 100 ? undefined : symbols;
	const batch = {
		ticker24hRaw: get24hrTickerStats(list, signal),
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
	candlesRaw: "candles",
	ticker24hRaw: "ticker24h",
};

/**
 * Fetches the three endpoints of one symbol. A failed endpoint only leaves its
 * part out of the snapshot (logged, counted): an order book error must not
 * cost the candles. Rejects when every endpoint failed, with the first error
 * (a 429, 418 or 451 wins over the others). `onBan` is called on a 429, 418 or 451
 * from any endpoint, so a partial snapshot still opens the quarantine.
 */
export async function fetchAllRawData(
	opts: SnapshotRequest,
	tickers?: TickerBatch,
	onBan?: (ban: NonNullable<ReturnType<typeof banOf>>) => void
): Promise<RawBinanceData> {
	const { symbol, candleLimit, candleStartTime, orderBookLimit } = opts;
	const { signal } = opts;
	const interval = opts.interval ?? CandleInterval.Min1;
	const requests: Record<RawKey, () => Promise<unknown>> = {
		orderBookRaw: () =>
			getOrderBook(
				{
					symbol,
					limit: orderBookLimit ?? PositiveInt.of(100),
				},
				signal
			),
		candlesRaw: () =>
			getCandlestickData(
				{
					symbol,
					limit: candleLimit ?? (100 as Limit),
					interval,
					startTime: candleStartTime,
				},
				signal
			),
		ticker24hRaw: () =>
			tickers
				? rowsOf(tickers.ticker24hRaw, symbol)
				: get24hrTickerStats([symbol], signal),
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
		if (signal?.aborted) {
			return; // cancelled by the stop, not a failed part
		}
		SNAPSHOT_PARTS_FAILED_TOTAL.inc({ part: PART_OF[key] });
		logger.warn("Market data part fetch failed", {
			context: { symbol, part: PART_OF[key] },
			error: normalizeError(outcome.reason),
		});
	});

	// A 418/451 on any endpoint, even with the others answered, must stop the next cycle.
	const ban = errors.map(banOf).find(Boolean);
	if (ban) {
		onBan?.(ban);
	}
	if (errors.length === keys.length) {
		throw normalizeError(errors.find(banOf) ?? errors[0]);
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
	const { orderBookRaw, candlesRaw } = raw;
	const { ticker24hRaw } = raw;
	return {
		orderBook:
			orderBookRaw &&
			normalizePart(query, "orderBook", () =>
				normalizeOrderBook(query, orderBookRaw)
			),
		// Binance returns the still-open candle last: persisting it would store a
		// partial candle that the next cycle overwrites with other values.
		candles:
			candlesRaw &&
			normalizePart(query, "candles", () => {
				const { kept, dropped } = dropPriceJumps(
					normalizeCandles(query, candlesRaw).filter(
						(candle) => candle.closeTimestamp + CLOSE_MARGIN_MS < fetchedAt
					)
				);
				if (dropped.length > 0) {
					CANDLES_REJECTED_TOTAL.inc({ reason: "price_jump" }, dropped.length);
					logger.warn("Candles with a price jump dropped", {
						context: {
							symbol: query.symbol,
							openTimes: dropped.map((candle) => candle.timestamp),
						},
					});
				}
				return kept;
			}),
		ticker24h:
			ticker24hRaw &&
			normalizePart(query, "ticker24h", () => normalizeTicker24h(ticker24hRaw)),
		fetchedAt,
	};
}
