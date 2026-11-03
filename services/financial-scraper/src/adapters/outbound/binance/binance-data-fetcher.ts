import { normalizeError } from "@trading-model/common/utils/errors";
import type { SymbolInterval } from "@trading-model/contracts/candlestick-query";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { Limit, PositiveInt } from "@trading-model/primitives/primitives";
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

type RawKey = keyof RawBinanceData;

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
	opts: SnapshotRequest
): Promise<RawBinanceData> {
	const { symbol, candleLimit, candleStartTime, tradeLimit, orderBookLimit } =
		opts;
	const interval = opts.interval ?? CandleInterval.Min1;
	const requests: Record<RawKey, () => Promise<unknown>> = {
		orderBookRaw: () =>
			getOrderBook({
				symbol,
				limit: orderBookLimit ?? (100 as unknown as PositiveInt),
			}),
		tradesRaw: () =>
			getRecentTrades({
				symbol,
				limit: tradeLimit ?? (100 as unknown as PositiveInt),
			}),
		candlesRaw: () =>
			getCandlestickData({
				symbol,
				limit: candleLimit ?? (100 as Limit),
				interval,
				startTime: candleStartTime,
			}),
		ticker24hRaw: () => get24hrTickerStats([symbol]),
		priceTickerRaw: () => getSymbolPriceTicker([symbol]),
		bookTickerRaw: () => getOrderBookTicker([symbol]),
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

export function buildResponse(
	query: SymbolInterval,
	raw: RawBinanceData
): MarketDataSnapshot {
	const fetchedAt = Date.now();
	return {
		orderBook:
			raw.orderBookRaw && BinanceNormalizer.orderBook(query, raw.orderBookRaw),
		recentTrades:
			raw.tradesRaw && BinanceNormalizer.trades(query, raw.tradesRaw),
		// Binance returns the still-open candle last: publishing it would send a
		// partial candle that the next cycle sends again with other values.
		candles:
			raw.candlesRaw &&
			BinanceNormalizer.candles(query, raw.candlesRaw).filter(
				(candle) => candle.closeTimestamp < fetchedAt
			),
		ticker24h:
			raw.ticker24hRaw && BinanceNormalizer.ticker24h(raw.ticker24hRaw),
		priceTicker:
			raw.priceTickerRaw && BinanceNormalizer.priceTicker(raw.priceTickerRaw),
		bookTicker:
			raw.bookTickerRaw && BinanceNormalizer.bookTicker(raw.bookTickerRaw),
		fetchedAt,
	};
}
