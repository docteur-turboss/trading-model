import { SourceType } from "@trading-model/contracts/market-data.types";
import { brand } from "@trading-model/contracts/wire/brand";
import {
	Asset,
	AssetId,
	AssetSignalsResponse,
	Dimension,
} from "@trading-model/contracts/wire/signals";
import {
	defineRoute,
	ErrorResponse,
} from "@trading-model/http/api-route/api-route";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import { z } from "zod";
import type { MarketDataPage } from "../../../domain/market-data.types";
import { Source } from "../../../domain/signals";

/**
 * HTTP API of financial-scraper (ADR-0021): market data and signal queries. Each entry
 * mounts its route (`routes.ts`), validates its parameters and documents it
 * in the OpenAPI.
 */

const BY_SOURCE = z.object({
	source: z.enum(SourceType.values() as [SourceType, ...SourceType[]]),
});

const BY_SYMBOL = z.object({
	symbol: z
		.string()
		.min(1)
		.transform(brand<string, TradingSymbol>(TradingSymbol.of)),
});

/** An ISO date or date-time, to epoch milliseconds. */
const ISO_DATE_MS = z
	.union([z.iso.datetime({ offset: true }), z.iso.date()])
	.transform((value) => Date.parse(value));

/** Candles, tickers and trades: an ISO date or date-time. */
const AT_DATE = z.object({
	timestamp: ISO_DATE_MS.transform(brand(UnixTimestamp.of)),
});

/** Rows of a market data page by default and at most (ADR-0054). */
export const DEFAULT_PAGE_LIMIT = 500;
export const MAX_PAGE_LIMIT = 5000;

const LIMIT = z.coerce
	.number()
	.int()
	.min(1)
	.max(MAX_PAGE_LIMIT)
	.default(DEFAULT_PAGE_LIMIT);

/** Key of the row a page ends on: (`timestamp` in epoch ms, `id`). */
export type PageKey = NonNullable<MarketDataPage["after"]>;

/** Opaque to clients: base64url of `<timestamp ms>.<id>`. */
export function encodeCursor(key: PageKey): string {
	return Buffer.from(`${key.timestamp}.${key.id}`).toString("base64url");
}

/** The key of a cursor `encodeCursor` made, or undefined for anything else. */
export function decodeCursor(cursor: string): PageKey | undefined {
	const match = /^(\d{1,15})\.(\d{1,15})$/.exec(
		Buffer.from(cursor, "base64url").toString()
	);
	return match
		? { timestamp: Number(match[1]), id: Number(match[2]) }
		: undefined;
}

const CURSOR = z.string().transform((cursor, ctx) => {
	const key = decodeCursor(cursor);
	if (!key) {
		ctx.addIssue({ code: "custom", message: "Invalid cursor" });
		return z.NEVER;
	}
	return key;
});

/** Trades, tickers, candles: keyset pages, optionally within [from, to). */
const PAGE_QUERY = z
	.object({
		limit: LIMIT,
		/** `nextCursor` of the previous page. */
		after: CURSOR.optional(),
		from: ISO_DATE_MS.optional(),
		to: ISO_DATE_MS.optional(),
	})
	.refine(
		(page) =>
			page.from === undefined || page.to === undefined || page.from < page.to,
		{ message: "from must be before to", path: ["to"] }
	);

/** Most signals one answer holds; past it the answer says `truncated`. */
export const MAX_SIGNALS_PER_ANSWER = 5000;

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
		query: PAGE_QUERY,
		responses: {
			200: z.object({
				/** Oldest first, then by insertion order. */
				rows: z.array(item),
				/** Pass as `after` for the next page; null on the last page. */
				nextCursor: z.string().nullable(),
				/** Rows are left past this page: `nextCursor !== null`. */
				truncated: z.boolean(),
			}),
			400: ErrorResponse,
		},
	});
}

export const SCRAPER_API = {
	tradesBySource: query(
		"/v2/trade/sources/:source",
		"Trades of a source",
		BY_SOURCE,
		Trade
	),
	tradesBySymbol: query(
		"/v2/trade/symbols/:symbol",
		"Trades of a symbol",
		BY_SYMBOL,
		Trade
	),
	tradesAt: query(
		"/v2/trade/timestamp/:timestamp",
		"Trades at exactly this instant",
		AT_DATE,
		Trade
	),
	tickersBySource: query(
		"/v2/ticker/sources/:source",
		"24h tickers of a source",
		BY_SOURCE,
		Ticker
	),
	tickersBySymbol: query(
		"/v2/ticker/symbols/:symbol",
		"24h tickers of a symbol",
		BY_SYMBOL,
		Ticker
	),
	tickersAt: query(
		"/v2/ticker/timestamp/:timestamp",
		"24h tickers opened at exactly this instant",
		AT_DATE,
		Ticker
	),
	candlesBySource: query(
		"/v2/candles/sources/:source",
		"Candles of a source",
		BY_SOURCE,
		Candle
	),
	candlesBySymbol: query(
		"/v2/candles/symbols/:symbol",
		"Candles of a symbol",
		BY_SYMBOL,
		Candle
	),
	candlesSince: query(
		"/v2/candles/timestamp/:timestamp",
		"Candles opened after a date",
		AT_DATE,
		Candle
	),
	/** ADR-0036: every dimension, the sector and area signals of the asset included. */
	assetSignals: defineRoute({
		method: "GET",
		path: "/v2/signals/assets/:assetId",
		summary:
			"Signals of an asset, of its sector and of its areas, every dimension, observed in [from, to)",
		params: z.object({ assetId: AssetId }),
		query: z
			.object({
				from: ISO_DATE_MS,
				to: ISO_DATE_MS,
				/** Filters, applied in SQL; without them, everything. */
				dimension: Dimension.optional(),
				metric: z.string().min(1).optional(),
				sourceId: z.string().min(1).optional(),
			})
			.refine((window) => window.from < window.to, {
				message: "from must be before to",
				path: ["to"],
			}),
		responses: {
			200: AssetSignalsResponse,
			400: ErrorResponse,
			404: ErrorResponse,
		},
	}),
	assets: defineRoute({
		method: "GET",
		path: "/v2/signals/assets",
		summary: "Assets of the signal registry",
		responses: { 200: z.object({ assets: z.array(Asset) }) },
	}),
	sources: defineRoute({
		method: "GET",
		path: "/v2/signals/sources",
		summary: "Sources of the signal registry, with their terms of use",
		responses: {
			200: z.object({
				sources: z.array(
					z.object({
						id: Source.shape.id,
						covers: Source.shape.covers,
						schedule: z.string(),
						reliabilityScore: z.number(),
						terms: z.string(),
						termsUrl: z.string(),
						attribution: z.string().optional(),
					})
				),
			}),
		},
	}),
} as const;
