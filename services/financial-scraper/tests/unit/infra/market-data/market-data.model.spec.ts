import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/trades.schema",
	() => ({
		insertTrades: jest.fn(),
	})
);

jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/ticker24h.schema",
	() => ({
		insertTicker: jest.fn(),
	})
);

jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/candles-schema",
	() => ({
		insertCandles: jest.fn(),
	})
);

jest.mock(
	"../../../../src/adapters/outbound/persistence/schema/order-book.schema",
	() => ({
		insertOrderBook: jest.fn(),
	})
);

import { MarketDataModel } from "../../../../src/adapters/outbound/persistence/market-data.model";

describe("MarketDataModel", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("insertCandles should delegate to schema", async () => {
		const data = [{ symbol: "BTCUSDT" }] as never;
		await MarketDataModel.insertCandles(data);
		const {
			insertCandles,
		} = require("../../../../src/adapters/outbound/persistence/schema/candles-schema");
		expect(insertCandles).toHaveBeenCalledWith(data);
	});

	it("insertTrades should delegate to schema", async () => {
		const data = [{ tradeId: 1n }] as never;
		await MarketDataModel.insertTrades(data);
		const {
			insertTrades,
		} = require("../../../../src/adapters/outbound/persistence/schema/trades.schema");
		expect(insertTrades).toHaveBeenCalledWith(data);
	});

	it("insertOrderBook should delegate to schema", async () => {
		const data = { symbol: "BTCUSDT" } as never;
		await MarketDataModel.insertOrderBook(data);
		const {
			insertOrderBook,
		} = require("../../../../src/adapters/outbound/persistence/schema/order-book.schema");
		expect(insertOrderBook).toHaveBeenCalledWith([data]);
	});

	it("insertTicker should delegate to schema", async () => {
		const data = [{ symbol: "BTCUSDT" }] as never;
		await MarketDataModel.insertTicker(data);
		const {
			insertTicker,
		} = require("../../../../src/adapters/outbound/persistence/schema/ticker24h.schema");
		expect(insertTicker).toHaveBeenCalledWith(data);
	});
});
