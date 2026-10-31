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
const selectOrderBookBy = {
	symbol: jest.fn<any>(),
	source: jest.fn<any>(),
	timestamp: { after: jest.fn<any>(), before: jest.fn<any>() },
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
jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/order-book.schema",
	() => ({ selectOrderBookBy })
);

import { SCRAPER_API } from "../../../../src/adapters/inbound/http/api-routes";
import { FINANCIAL_ROUTES } from "../../../../src/adapters/inbound/http/routes";

const AT = new Date("2026-10-28T12:00:00.000Z");
const MARKET = { symbol: "BTCUSDT", market: "crypto", source: "binance" };

/** Rows as the MySQL repositories return them (Dates, BIGINT as bigint). */
const TRADE = {
	...MARKET,
	side: "buy",
	price: 67000.5,
	quantity: 0.25,
	tradeId: 9_007_199_254_740_993n,
	timestamp: AT,
};
const TICKER = {
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
/** In-memory snapshot: levels in Sets, epoch-millisecond timestamp. */
const ORDER_BOOK = {
	...MARKET,
	timestamp: AT.getTime(),
	bids: new Set([{ price: 66999, quantity: 1 }]),
	asks: new Set([{ price: 67001, quantity: 2 }]),
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
			expect(body).toEqual([
				{
					...TRADE,
					tradeId: "9007199254740993",
					timestamp: AT.toISOString(),
				},
			]);
			expect(selectTradesBy.symbol).toHaveBeenCalledWith("BTCUSDT");
		});

		it("queries a source", async () => {
			selectTradesBy.source.mockResolvedValue([]);

			const { status } = await get(
				SCRAPER_API.tradesBySource,
				"/trade/sources/binance"
			);

			expect(status).toBe(200);
			expect(selectTradesBy.source).toHaveBeenCalledWith("binance");
		});

		it("queries an exact instant given as an ISO date-time", async () => {
			selectTradesBy.timestamp.mockResolvedValue([]);

			await get(SCRAPER_API.tradesAt, `/trade/timestamp/${AT.toISOString()}`);

			expect(selectTradesBy.timestamp).toHaveBeenCalledWith(AT.getTime());
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
				Date.parse("2026-10-28")
			);
		});
	});

	describe("order books", () => {
		it("sends the levels as arrays, not as empty objects", async () => {
			selectOrderBookBy.symbol.mockResolvedValue([ORDER_BOOK]);

			const { body } = await get(
				SCRAPER_API.orderBooksBySymbol,
				"/orderbook/symbols/BTCUSDT"
			);

			expect(body).toEqual([
				{
					...ORDER_BOOK,
					bids: [{ price: 66999, quantity: 1 }],
					asks: [{ price: 67001, quantity: 2 }],
				},
			]);
		});

		it("answers an empty list for an unknown key, and skips gaps", async () => {
			selectOrderBookBy.source.mockResolvedValue(null);
			selectOrderBookBy.timestamp.after.mockResolvedValue([
				undefined,
				ORDER_BOOK,
			]);

			const unknown = await get(
				SCRAPER_API.orderBooksBySource,
				"/orderbook/sources/nyse"
			);
			const after = await get(
				SCRAPER_API.orderBooksAfter,
				"/orderbook/after/timestamp/0"
			);

			expect(unknown.body).toEqual([]);
			expect(after.body).toHaveLength(1);
		});

		it("queries the snapshots before an instant in epoch milliseconds", async () => {
			selectOrderBookBy.timestamp.before.mockResolvedValue([]);

			await get(
				SCRAPER_API.orderBooksBefore,
				`/orderbook/before/timestamp/${AT.getTime()}`
			);

			expect(selectOrderBookBy.timestamp.before).toHaveBeenCalledWith(
				AT.getTime()
			);
		});
	});

	describe("invalid parameters: 400 before any query", () => {
		it.each([
			[SCRAPER_API.tradesBySource, "/trade/sources/unknown-exchange"],
			[SCRAPER_API.tradesAt, "/trade/timestamp/yesterday"],
			[SCRAPER_API.tradesAt, "/trade/timestamp/1761652800000"],
			[SCRAPER_API.candlesSince, "/candles/timestamp/1960-01-01"],
			[SCRAPER_API.orderBooksAfter, "/orderbook/after/timestamp/-5"],
			[SCRAPER_API.orderBooksBefore, "/orderbook/before/timestamp/1.5"],
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
