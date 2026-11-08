import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	type ApiRoute,
	responseIssues,
} from "@trading-model/http/adapters/inbound/api-route/api-route";
import express from "express";

const selectTradesBy = {
	symbol: jest.fn<any>(),
	timestamp: jest.fn<any>(),
	source: jest.fn<any>(),
};
const selectTickerBy = {
	symbol: jest.fn<any>(),
	timestamp: jest.fn<any>(),
	source: jest.fn<any>(),
};
const selectCandlesBy = {
	symbol: jest.fn<any>(),
	source: jest.fn<any>(),
	timestamp: { after: jest.fn<any>() },
};

jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/trades.schema",
	() => ({ selectTradesBy })
);
jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/ticker24h.schema",
	() => ({ selectTickerBy })
);
jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/candles-schema",
	() => ({ selectCandlesBy })
);
const findForAsset = jest.fn<any>();
jest.mock("../../../../src/adapters/outbound/persistence/signal-store", () => ({
	MySqlSignalStore: { findForAsset },
}));

import {
	DEFAULT_PAGE_LIMIT,
	decodeCursor,
	encodeCursor,
	MAX_PAGE_LIMIT,
	MAX_SIGNALS_PER_ANSWER,
	SCRAPER_API,
} from "../../../../src/adapters/inbound/http/api-routes";
import { FINANCIAL_ROUTES } from "../../../../src/adapters/inbound/http/routes";

const AT = new Date("2026-10-28T12:00:00.000Z");
const MARKET = { symbol: "BTCUSDT", market: "crypto", source: "binance" };

/** Rows as the MySQL repositories return them (Dates, BIGINT as bigint, internal id). */
const TRADE = {
	id: 1,
	...MARKET,
	side: "buy",
	price: 67000.5,
	quantity: 0.25,
	tradeId: 9_007_199_254_740_993n,
	timestamp: AT,
};
const TICKER = {
	id: 1,
	...MARKET,
	open: 1,
	high: 2,
	low: 0.5,
	last: 1.5,
	volume: 10,
	timestamp: AT,
	closeTimestamp: AT,
};
const CANDLE = {
	id: 1,
	...MARKET,
	interval: "1m",
	open: 1,
	high: 2,
	low: 0.5,
	close: 1.5,
	volume: 10,
	trades: 42,
	timestamp: AT,
	closeTimestamp: AT,
};

describe("financial-scraper HTTP API (SCRAPER_API)", () => {
	let server: Server;
	let baseUrl: string;

	beforeAll(async () => {
		const app = express();
		app.use(FINANCIAL_ROUTES());
		await new Promise<void>((resolve) => {
			server = app.listen(0, resolve);
		});
		baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
	});

	afterAll(async () => {
		await new Promise((resolve) => server.close(resolve));
	});

	beforeEach(() => {
		jest.clearAllMocks();
	});

	/** GET the path, check the response against the route's entry. */
	async function get(route: ApiRoute, path: string) {
		const res = await fetch(`${baseUrl}${path}`);
		const body = await res.json();
		expect(responseIssues(route, res.status, body)).toEqual([]);
		return { status: res.status, body };
	}

	describe("trades", () => {
		it("sends BIGINT trade ids as exact decimal strings", async () => {
			selectTradesBy.symbol.mockResolvedValue([TRADE]);

			const { status, body } = await get(
				SCRAPER_API.tradesBySymbol,
				"/trade/symbols/BTCUSDT"
			);

			expect(status).toBe(200);
			const { id: _id, ...row } = TRADE;
			expect(body).toEqual({
				rows: [
					{
						...row,
						tradeId: "9007199254740993",
						timestamp: AT.toISOString(),
					},
				],
				nextCursor: null,
				truncated: false,
			});
			expect(selectTradesBy.symbol).toHaveBeenCalledWith("BTCUSDT", {
				limit: DEFAULT_PAGE_LIMIT + 1,
			});
		});

		it("queries a source", async () => {
			selectTradesBy.source.mockResolvedValue([]);

			const { status } = await get(
				SCRAPER_API.tradesBySource,
				"/trade/sources/binance"
			);

			expect(status).toBe(200);
			expect(selectTradesBy.source).toHaveBeenCalledWith("binance", {
				limit: DEFAULT_PAGE_LIMIT + 1,
			});
		});

		it("queries an exact instant given as an ISO date-time", async () => {
			selectTradesBy.timestamp.mockResolvedValue([]);

			await get(SCRAPER_API.tradesAt, `/trade/timestamp/${AT.toISOString()}`);

			expect(selectTradesBy.timestamp).toHaveBeenCalledWith(AT.getTime(), {
				limit: DEFAULT_PAGE_LIMIT + 1,
			});
		});
	});

	describe("tickers", () => {
		it.each([
			[SCRAPER_API.tickersBySource, "/ticker/sources/binance", "source"],
			[SCRAPER_API.tickersBySymbol, "/ticker/symbols/BTCUSDT", "symbol"],
			[SCRAPER_API.tickersAt, "/ticker/timestamp/2026-10-28", "timestamp"],
		] as const)("%#: %s answers documented rows", async (route, path, by) => {
			selectTickerBy[by].mockResolvedValue([TICKER]);

			const { status } = await get(route, path);

			expect(status).toBe(200);
		});
	});

	describe("candles", () => {
		it.each([
			[SCRAPER_API.candlesBySource, "/candles/sources/binance"],
			[SCRAPER_API.candlesBySymbol, "/candles/symbols/BTCUSDT"],
		] as const)("%#: %s answers documented rows", async (route, path) => {
			selectCandlesBy.source.mockResolvedValue([CANDLE]);
			selectCandlesBy.symbol.mockResolvedValue([
				{ ...CANDLE, trades: undefined },
			]);

			const { status } = await get(route, path);

			expect(status).toBe(200);
		});

		it("queries the candles after a date", async () => {
			selectCandlesBy.timestamp.after.mockResolvedValue([CANDLE]);

			await get(SCRAPER_API.candlesSince, "/candles/timestamp/2026-10-28");

			expect(selectCandlesBy.timestamp.after).toHaveBeenCalledWith(
				Date.parse("2026-10-28"),
				{ limit: DEFAULT_PAGE_LIMIT + 1 }
			);
		});
	});

	describe("pages of trades, tickers and candles (ADR-0054)", () => {
		/** `count` rows, one millisecond apart, ids 1..count. */
		const rows = <T extends object>(row: T, count: number) =>
			Array.from({ length: count }, (_, i) => ({
				...row,
				id: i + 1,
				timestamp: new Date(AT.getTime() + i),
			}));

		it.each([
			[
				"trades",
				SCRAPER_API.tradesBySymbol,
				"/trade/symbols/BTCUSDT",
				() => selectTradesBy.symbol,
				TRADE,
			],
			[
				"tickers",
				SCRAPER_API.tickersBySymbol,
				"/ticker/symbols/BTCUSDT",
				() => selectTickerBy.symbol,
				TICKER,
			],
			[
				"candles",
				SCRAPER_API.candlesBySymbol,
				"/candles/symbols/BTCUSDT",
				() => selectCandlesBy.symbol,
				CANDLE,
			],
		] as const)(
			"%s: more rows than limit answer limit rows and a cursor",
			async (_family, route, path, select, row) => {
				// The repository is asked for limit + 1: it found that many.
				select().mockResolvedValue(rows(row, 4));

				const { status, body } = await get(route, `${path}?limit=3`);

				expect(status).toBe(200);
				expect(select()).toHaveBeenCalledWith("BTCUSDT", { limit: 4 });
				expect(body.rows).toHaveLength(3);
				expect(body.rows[0]).not.toHaveProperty("id");
				expect(body.truncated).toBe(true);
				expect(decodeCursor(body.nextCursor)).toEqual({
					timestamp: AT.getTime() + 2,
					id: 3,
				});
			}
		);

		it("resumes after the cursor, within the window", async () => {
			selectTradesBy.symbol.mockResolvedValue(rows(TRADE, 2));
			const cursor = encodeCursor({ timestamp: AT.getTime(), id: 9 });

			const { body } = await get(
				SCRAPER_API.tradesBySymbol,
				`/trade/symbols/BTCUSDT?limit=2&after=${cursor}&from=2026-10-28&to=2026-10-29`
			);

			expect(selectTradesBy.symbol).toHaveBeenCalledWith("BTCUSDT", {
				limit: 3,
				after: { timestamp: AT.getTime(), id: 9 },
				from: Date.parse("2026-10-28"),
				to: Date.parse("2026-10-29"),
			});
			expect(body).toMatchObject({ nextCursor: null, truncated: false });
		});

		it.each([
			[
				"a limit past the maximum",
				`limit=${MAX_PAGE_LIMIT + 1}`,
				"query.limit",
			],
			["a limit of zero", "limit=0", "query.limit"],
			["a cursor it did not make", "after=bm90LWEtY3Vyc29y", "query.after"],
			["an empty window", "from=2026-10-29&to=2026-10-28", "query.to"],
		])("answers 400 for %s", async (_label, search, field) => {
			const { status, body } = await get(
				SCRAPER_API.candlesBySource,
				`/candles/sources/binance?${search}`
			);

			expect(status).toBe(400);
			expect(body.details).toEqual(
				expect.arrayContaining([expect.objectContaining({ field })])
			);
			expect(selectCandlesBy.source).not.toHaveBeenCalled();
		});
	});

	describe("signals of an asset (ADR-0036)", () => {
		const SIGNAL = {
			id: "b".repeat(64),
			schemaVersion: 1,
			sourceId: "nws-kansas-wheat-belt",
			dimension: "contextual",
			assetId: null,
			sector: "agriculture",
			observedAt: "2026-11-04T12:40:00.000Z",
			ingestedAt: "2026-11-04T13:00:00.000Z",
			confidenceScore: 0.8,
			payload: {
				metric: "temperature",
				value: 4,
				unit: "wmoUnit:degC",
				location: { latitude: 38.07, longitude: -97.87, name: "KHUT" },
				details: { qualityControl: "V" },
			},
		};
		const WINDOW = "from=2026-11-04&to=2026-11-05T00:00:00Z";

		it("answers the asset with its own and its sector signals of its dimensions in the window", async () => {
			findForAsset.mockResolvedValue([SIGNAL]);

			const { status, body } = await get(
				SCRAPER_API.assetSignals,
				`/signals/assets/WHEAT?${WINDOW}`
			);

			expect(status).toBe(200);
			expect(body).toEqual({
				asset: {
					id: "WHEAT",
					name: "Wheat, through the Teucrium Wheat Fund",
					assetType: "commodity_proxy",
					identifier: { scheme: "ticker", ticker: "WEAT", exchange: "ARCX" },
					applicableDimensions: ["market", "contextual", "macro"],
					sector: "agriculture",
				},
				signals: [SIGNAL],
				truncated: false,
			});
			expect(findForAsset).toHaveBeenCalledWith({
				assetId: "WHEAT",
				sector: "agriculture",
				dimensions: ["market", "contextual", "macro"],
				from: Date.parse("2026-11-04"),
				to: Date.parse("2026-11-05T00:00:00Z"),
				limit: MAX_SIGNALS_PER_ANSWER + 1,
			});
		});

		it("says truncated when the window holds more than one answer", async () => {
			findForAsset.mockResolvedValue(
				new Array(MAX_SIGNALS_PER_ANSWER + 1).fill(SIGNAL)
			);

			const { body } = await get(
				SCRAPER_API.assetSignals,
				`/signals/assets/WHEAT?${WINDOW}`
			);

			expect(body.signals).toHaveLength(MAX_SIGNALS_PER_ANSWER);
			expect(body.truncated).toBe(true);
		});

		it("answers 404 for an asset the registry does not know", async () => {
			const { status } = await get(
				SCRAPER_API.assetSignals,
				`/signals/assets/DOGE?${WINDOW}`
			);

			expect(status).toBe(404);
			expect(findForAsset).not.toHaveBeenCalled();
		});

		it.each([
			["an empty window", "from=2026-11-05&to=2026-11-04", "query.to"],
			["no window", "", "query.from"],
			["a bound that is no date", "from=yesterday&to=2026-11-05", "query.from"],
		])("answers 400 for %s", async (_label, search, field) => {
			const { status, body } = await get(
				SCRAPER_API.assetSignals,
				`/signals/assets/BTC?${search}`
			);

			expect(status).toBe(400);
			expect(body.details).toEqual(
				expect.arrayContaining([expect.objectContaining({ field })])
			);
			expect(findForAsset).not.toHaveBeenCalled();
		});

		it("answers 400 for an asset id the schema refuses", async () => {
			const { status } = await get(
				SCRAPER_API.assetSignals,
				`/signals/assets/btc?${WINDOW}`
			);

			expect(status).toBe(400);
		});
	});

	describe("invalid parameters: 400 before any query", () => {
		it.each([
			[SCRAPER_API.tradesBySource, "/trade/sources/unknown-exchange"],
			[SCRAPER_API.tradesAt, "/trade/timestamp/yesterday"],
			[SCRAPER_API.tradesAt, "/trade/timestamp/1761652800000"],
			[SCRAPER_API.candlesSince, "/candles/timestamp/1960-01-01"],
		] as const)("%#: %s", async (route, path) => {
			const { status, body } = await get(route, path);

			expect(status).toBe(400);
			expect(body).toMatchObject({
				error: "Validation failed",
				details: [
					expect.objectContaining({
						field: expect.stringMatching(/^params\.(source|timestamp)$/),
					}),
				],
			});
		});
	});
});
