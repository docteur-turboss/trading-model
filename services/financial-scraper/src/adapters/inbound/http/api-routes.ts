import { SourceType } from "@trading-model/contracts/market-data.types";
import {
	brand,
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import {
	type TradingSymbol,
	toSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { z } from "zod";

/**
 * HTTP API of financial-scraper (ADR-0021): market data queries. Each entry
 * mounts its route (`routes.ts`), validates its parameters and documents it
 * in the OpenAPI.
 */

const BY_SOURCE = z.object({
	source: z.enum(SourceType.values() as [SourceType, ...SourceType[]]),
});

const BY_SYMBOL = z.object({
	symbol: z.string().min(1).transform(brand<string, TradingSymbol>(toSymbol)),
});

/** Candles, tickers and trades: an ISO date or date-time. */
const AT_DATE = z.object({
	timestamp: z
		.union([z.iso.datetime({ offset: true }), z.iso.date()])
		.transform((value) => Date.parse(value))
		.transform(brand(UnixTimestamp.of)),
});

/** Order books: epoch milliseconds. */
const EPOCH_MS = z.object({
	timestamp: z.coerce.number().int().min(0).transform(brand(UnixTimestamp.of)),
});

/** MySQL `DATETIME` columns, serialized by `Date#toJSON`. */
const DATE_TIME = z.iso.datetime();

const MARKET = {
	symbol: z.string(),
	market: z.string(),
	source: z.string(),
};

const Candle = z.object({
	...MARKET,
	interval: z.string(),
	open: z.number(),
	high: z.number(),
	low: z.number(),
	close: z.number(),
	volume: z.number(),
	/** Absent when the source does not report it. */
	trades: z.number().int().optional(),
	timestamp: DATE_TIME,
	closeTimestamp: DATE_TIME,
});

const Ticker = z.object({
	...MARKET,
	open: z.number(),
	high: z.number(),
	low: z.number(),
	last: z.number(),
	volume: z.number(),
	timestamp: DATE_TIME,
	closeTimestamp: DATE_TIME,
});

const Trade = z.object({
	...MARKET,
	side: z.string(),
	price: z.number(),
	quantity: z.number(),
	/** BIGINT: a decimal string, exact past 2^53. */
	tradeId: z.string().regex(/^\d+$/),
	timestamp: DATE_TIME,
});

const OrderBookLevel = z.object({ price: z.number(), quantity: z.number() });

/** Order books are in-memory snapshots, timestamped in epoch milliseconds. */
const OrderBook = z.object({
	...MARKET,
	timestamp: z.number().int(),
	bids: z.array(OrderBookLevel),
	asks: z.array(OrderBookLevel),
});

function query<
	const Path extends string,
	Params extends z.ZodType,
	Item extends z.ZodType,
>(path: Path, summary: string, params: Params, item: Item) {
	return defineRoute({
		method: "GET",
		path,
		summary,
		params,
		responses: { 200: z.array(item), 400: ErrorResponse },
	});
}

export const SCRAPER_API = {
	tradesBySource: query(
		"/trade/sources/:source",
		"Trades of a source",
		BY_SOURCE,
		Trade
	),
	tradesBySymbol: query(
		"/trade/symbols/:symbol",
		"Trades of a symbol",
		BY_SYMBOL,
		Trade
	),
	tradesAt: query(
		"/trade/timestamp/:timestamp",
		"Trades at exactly this instant",
		AT_DATE,
		Trade
	),
	tickersBySource: query(
		"/ticker/sources/:source",
		"24h tickers of a source",
		BY_SOURCE,
		Ticker
	),
	tickersBySymbol: query(
		"/ticker/symbols/:symbol",
		"24h tickers of a symbol",
		BY_SYMBOL,
		Ticker
	),
	tickersAt: query(
		"/ticker/timestamp/:timestamp",
		"24h tickers opened at exactly this instant",
		AT_DATE,
		Ticker
	),
	candlesBySource: query(
		"/candles/sources/:source",
		"Candles of a source",
		BY_SOURCE,
		Candle
	),
	candlesBySymbol: query(
		"/candles/symbols/:symbol",
		"Candles of a symbol",
		BY_SYMBOL,
		Candle
	),
	candlesSince: query(
		"/candles/timestamp/:timestamp",
		"Candles opened after a date",
		AT_DATE,
		Candle
	),
	orderBooksBySource: query(
		"/orderbook/sources/:source",
		"Order book snapshots of a source",
		BY_SOURCE,
		OrderBook
	),
	orderBooksBySymbol: query(
		"/orderbook/symbols/:symbol",
		"Order book snapshots of a symbol",
		BY_SYMBOL,
		OrderBook
	),
	orderBooksAfter: query(
		"/orderbook/after/timestamp/:timestamp",
		"Order book snapshots after an instant",
		EPOCH_MS,
		OrderBook
	),
	orderBooksBefore: query(
		"/orderbook/before/timestamp/:timestamp",
		"Order book snapshots before an instant",
		EPOCH_MS,
		OrderBook
	),
} as const;
