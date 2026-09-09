import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../../src/infra/market-data/schema/trades.schema", () => ({
	insertTrades: jest.fn(),
}));

jest.mock("../../../../src/infra/market-data/schema/ticker24h.schema", () => ({
	insertTicker: jest.fn(),
}));

jest.mock("../../../../src/infra/market-data/schema/candles-schema", () => ({
	insertCandles: jest.fn(),
}));

jest.mock("../../../../src/infra/market-data/schema/order-book.schema", () => ({
	insertOrderBook: jest.fn(),
}));

import { MarketDataModel } from "../../../../src/domain/market-data.model";

describe("MarketDataModel", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("insertCandles should delegate to schema", async () => {
		const data = [{ symbol: "BTCUSDT" }] as never;
		await MarketDataModel.insertCandles(data);
		const {
			insertCandles,
		} = require("../../../../src/infra/market-data/schema/candles-schema");
		expect(insertCandles).toHaveBeenCalledWith(data);
	});

	it("insertTrades should delegate to schema", async () => {
		const data = [{ tradeId: 1n }] as never;
		await MarketDataModel.insertTrades(data);
		const {
			insertTrades,
		} = require("../../../../src/infra/market-data/schema/trades.schema");
		expect(insertTrades).toHaveBeenCalledWith(data);
	});

	it("insertOrderBook should delegate to schema", async () => {
		const data = { symbol: "BTCUSDT" } as never;
		await MarketDataModel.insertOrderBook(data);
		const {
			insertOrderBook,
		} = require("../../../../src/infra/market-data/schema/order-book.schema");
		expect(insertOrderBook).toHaveBeenCalledWith([data]);
	});

	it("insertTicker should delegate to schema", async () => {
		const data = [{ symbol: "BTCUSDT" }] as never;
		await MarketDataModel.insertTicker(data);
		const {
			insertTicker,
		} = require("../../../../src/infra/market-data/schema/ticker24h.schema");
		expect(insertTicker).toHaveBeenCalledWith(data);
	});
});
