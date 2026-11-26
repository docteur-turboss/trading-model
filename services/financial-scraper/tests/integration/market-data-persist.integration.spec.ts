import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import type { Mock } from "jest-mock";

jest.mock(
	"../../src/adapters/outbound/persistence/schema/candles.schema",
	() => ({ insertCandles: jest.fn<(...args: any[]) => any>() })
);
jest.mock(
	"../../src/adapters/outbound/persistence/schema/order-book.schema",
	() => ({ insertOrderBook: jest.fn<(...args: any[]) => any>() })
);
jest.mock(
	"../../src/adapters/outbound/persistence/schema/ticker24h.schema",
	() => ({ insertTicker: jest.fn<(...args: any[]) => any>() })
);

import { insertCandles } from "../../src/adapters/outbound/persistence/schema/candles.schema";
import { insertOrderBook } from "../../src/adapters/outbound/persistence/schema/order-book.schema";
import { insertTicker } from "../../src/adapters/outbound/persistence/schema/ticker24h.schema";
import { MarketDataPersister } from "../../src/config/container";

describe("MarketDataPersister — persist integration", () => {
	const mockCandles = [{ symbol: "BTCUSDT", interval: CandleInterval.Min1 }];
	const mockOrderBook = { symbol: "BTCUSDT" };
	const mockTicker24h = [{ symbol: "BTCUSDT" }];

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should persist candles, orderBook and ticker when all present", async () => {
		await MarketDataPersister.persist({
			candles: mockCandles as never,
			orderBook: mockOrderBook as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect((insertCandles as Mock).mock.calls[0][0]).toBe(mockCandles);
		expect((insertOrderBook as Mock).mock.calls[0][0]).toEqual([mockOrderBook]);
		expect((insertTicker as Mock).mock.calls[0][0]).toBe(mockTicker24h);
	});

	it("should only persist which is truthy candles ticker", async () => {
		await MarketDataPersister.persist({
			candles: mockCandles as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect(insertCandles).toHaveBeenCalledTimes(1);
		expect(insertOrderBook).not.toHaveBeenCalled();
	});

	it("should skip empty arrays", async () => {
		await MarketDataPersister.persist({
			candles: [],
			fetchedAt: Date.now(),
		});

		expect(insertCandles).not.toHaveBeenCalled();
	});

	it("should handle empty payload gracefully", async () => {
		await MarketDataPersister.persist({
			fetchedAt: Date.now(),
		});

		expect(insertCandles).not.toHaveBeenCalled();
		expect(insertOrderBook).not.toHaveBeenCalled();
		expect(insertTicker).not.toHaveBeenCalled();
	});

	it("should call all insert methods concurrently", async () => {
		const order: string[] = [];

		(insertCandles as Mock).mockImplementation(() => {
			order.push("candles");
			return Promise.resolve();
		});
		(insertTicker as Mock).mockImplementation(() => {
			order.push("ticker");
			return Promise.resolve();
		});

		await MarketDataPersister.persist({
			candles: mockCandles as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect(order).toContain("candles");
		expect(order).toContain("ticker");
	});
});
