import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_GET_TRADE_BY_SOURCE_CONTROLLER = jest.fn();
const MOCK_GET_TRADE_BY_SYMBOL_CONTROLLER = jest.fn();
const MOCK_GET_TICKER_BY_SOURCE_CONTROLLER = jest.fn();
const MOCK_GET_TICKER_BY_SYMBOL_CONTROLLER = jest.fn();
const MOCK_GET_CANDLES_BY_SOURCE_CONTROLLER = jest.fn();
const MOCK_GET_CANDLES_BY_SYMBOL_CONTROLLER = jest.fn();
const MOCK_GET_TRADE_BY_TIMESTAMP_CONTROLLER = jest.fn();
const MOCK_GET_ORDER_BOOK_BY_SOURCE_CONTROLLER = jest.fn();
const MOCK_GET_TICKER_BY_TIMESTAMP_CONTROLLER = jest.fn();
const MOCK_GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER = jest.fn();
const MOCK_GET_CANDLES_BY_TIMESTAMP_CONTROLLER = jest.fn();
const MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER = jest.fn();
const MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER = jest.fn();

jest.mock("../../../../src/clients/http/controller", () => ({
	GET_TRADE_BY_SOURCE_CONTROLLER: MOCK_GET_TRADE_BY_SOURCE_CONTROLLER,
	GET_TRADE_BY_SYMBOL_CONTROLLER: MOCK_GET_TRADE_BY_SYMBOL_CONTROLLER,
	GET_TICKER_BY_SOURCE_CONTROLLER: MOCK_GET_TICKER_BY_SOURCE_CONTROLLER,
	GET_TICKER_BY_SYMBOL_CONTROLLER: MOCK_GET_TICKER_BY_SYMBOL_CONTROLLER,
	GET_CANDLES_BY_SOURCE_CONTROLLER: MOCK_GET_CANDLES_BY_SOURCE_CONTROLLER,
	GET_CANDLES_BY_SYMBOL_CONTROLLER: MOCK_GET_CANDLES_BY_SYMBOL_CONTROLLER,
	GET_TRADE_BY_TIMESTAMP_CONTROLLER: MOCK_GET_TRADE_BY_TIMESTAMP_CONTROLLER,
	GET_ORDER_BOOK_BY_SOURCE_CONTROLLER: MOCK_GET_ORDER_BOOK_BY_SOURCE_CONTROLLER,
	GET_TICKER_BY_TIMESTAMP_CONTROLLER: MOCK_GET_TICKER_BY_TIMESTAMP_CONTROLLER,
	GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER: MOCK_GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER,
	GET_CANDLES_BY_TIMESTAMP_CONTROLLER: MOCK_GET_CANDLES_BY_TIMESTAMP_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER:
		MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER,
	GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER:
		MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER,
}));

import { FINANCIAL_ROUTES } from "../../../../src/clients/http/routes";

describe("FINANCIAL_ROUTES", () => {
	let router: any;
	let routes: Array<{ method: string; path: string; handler: any }>;

	beforeEach(() => {
		jest.clearAllMocks();
		routes = [];

		const mockRouter = {
			get: jest.fn((path: string, handler: any) => {
				routes.push({ method: "get", path, handler });
				return mockRouter;
			}),
		};

		jest.spyOn(require("express"), "Router").mockReturnValue(mockRouter);
		router = FINANCIAL_ROUTES();
	});

	it("should create an Express router", () => {
		expect(router).toBeDefined();
	});

	it("should register all trade routes", () => {
		expect(routes.filter((r) => r.path.includes("/trade"))).toHaveLength(3);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/trade/sources/:source",
				handler: MOCK_GET_TRADE_BY_SOURCE_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/trade/symbols/:symbol",
				handler: MOCK_GET_TRADE_BY_SYMBOL_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/trade/timestamp/:timestamp",
				handler: MOCK_GET_TRADE_BY_TIMESTAMP_CONTROLLER,
			})
		);
	});

	it("should register all ticker routes", () => {
		expect(routes.filter((r) => r.path.includes("/ticker"))).toHaveLength(3);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/ticker/sources/:source",
				handler: MOCK_GET_TICKER_BY_SOURCE_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/ticker/symbols/:symbol",
				handler: MOCK_GET_TICKER_BY_SYMBOL_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/ticker/timestamp/:timestamp",
				handler: MOCK_GET_TICKER_BY_TIMESTAMP_CONTROLLER,
			})
		);
	});

	it("should register all candles routes", () => {
		expect(routes.filter((r) => r.path.includes("/candles"))).toHaveLength(3);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/candles/sources/:source",
				handler: MOCK_GET_CANDLES_BY_SOURCE_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/candles/symbols/:symbol",
				handler: MOCK_GET_CANDLES_BY_SYMBOL_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/candles/timestamp/:timestamp",
				handler: MOCK_GET_CANDLES_BY_TIMESTAMP_CONTROLLER,
			})
		);
	});

	it("should register all orderbook routes", () => {
		const orderBookRoutes = routes.filter(
			(r) => r.path.includes("/orderbook") || r.path.includes("/heartbeat")
		);
		expect(orderBookRoutes).toHaveLength(4);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/orderbook/sources/:source",
				handler: MOCK_GET_ORDER_BOOK_BY_SOURCE_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/orderbook/symbols/:symbol",
				handler: MOCK_GET_ORDER_BOOK_BY_SYMBOL_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/orderbook/after/timestamp/:timestamp",
				handler: MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_AFTER_CONTROLLER,
			})
		);
		expect(routes).toContainEqual(
			expect.objectContaining({
				path: "/heartbeat/before/timestamp/:timestamp",
				handler: MOCK_GET_ORDER_BOOK_BY_TIMESTAMP_BEFORE_CONTROLLER,
			})
		);
	});

	it("should register exactly 13 routes", () => {
		expect(routes).toHaveLength(13);
	});

	it("should only use GET method", () => {
		routes.forEach((r) => {
			expect(r.method).toBe("get");
		});
	});
});
