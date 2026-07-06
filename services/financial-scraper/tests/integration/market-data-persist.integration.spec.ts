import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/common/config/event.types";
import type { Mock } from "jest-mock";

jest.mock("../../src/infra/market-data/market-data.model", () => ({
	MarketDataModel: {
		insertCandles: jest.fn(),
		insertTrades: jest.fn(),
		insertOrderBook: jest.fn(),
		insertTicker: jest.fn(),
	},
}));

import { MarketDataController } from "../../src/infra/market-data/market-data.controller";
import { MarketDataModel } from "../../src/infra/market-data/market-data.model";

describe("MarketDataController — persist integration", () => {
	const mockCandles = [{ symbol: "BTCUSDT", interval: CandleInterval.MIN1 }];
	const mockTrades = [{ tradeId: 1n, symbol: "BTCUSDT" }];
	const mockOrderBook = { symbol: "BTCUSDT" };
	const mockTicker24h = [{ symbol: "BTCUSDT" }];

	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should persist candles, trades, orderBook and ticker when all present", async () => {
		await MarketDataController.persist({
			candles: mockCandles as never,
			recentTrades: mockTrades as never,
			orderBook: mockOrderBook as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect((MarketDataModel.insertCandles as Mock).mock.calls[0][0]).toBe(
			mockCandles
		);
		expect((MarketDataModel.insertTrades as Mock).mock.calls[0][0]).toBe(
			mockTrades
		);
		expect((MarketDataModel.insertOrderBook as Mock).mock.calls[0][0]).toBe(
			mockOrderBook
		);
		expect((MarketDataModel.insertTicker as Mock).mock.calls[0][0]).toBe(
			mockTicker24h
		);
	});

	it("should only persist which is truthy candles trades ticker", async () => {
		await MarketDataController.persist({
			candles: mockCandles as never,
			recentTrades: mockTrades as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect(MarketDataModel.insertCandles).toHaveBeenCalledTimes(1);
		expect(MarketDataModel.insertOrderBook).not.toHaveBeenCalled();
	});

	it("should skip empty arrays", async () => {
		await MarketDataController.persist({
			candles: [],
			recentTrades: [],
			fetchedAt: Date.now(),
		});

		expect(MarketDataModel.insertCandles).not.toHaveBeenCalled();
		expect(MarketDataModel.insertTrades).not.toHaveBeenCalled();
	});

	it("should handle empty payload gracefully", async () => {
		await MarketDataController.persist({
			fetchedAt: Date.now(),
		});

		expect(MarketDataModel.insertCandles).not.toHaveBeenCalled();
		expect(MarketDataModel.insertTrades).not.toHaveBeenCalled();
		expect(MarketDataModel.insertOrderBook).not.toHaveBeenCalled();
		expect(MarketDataModel.insertTicker).not.toHaveBeenCalled();
	});

	it("should call all insert methods concurrently", async () => {
		const order: string[] = [];

		(MarketDataModel.insertCandles as Mock).mockImplementation(() => {
			order.push("candles");
			return Promise.resolve();
		});
		(MarketDataModel.insertTrades as Mock).mockImplementation(() => {
			order.push("trades");
			return Promise.resolve();
		});
		(MarketDataModel.insertTicker as Mock).mockImplementation(() => {
			order.push("ticker");
			return Promise.resolve();
		});

		await MarketDataController.persist({
			candles: mockCandles as never,
			recentTrades: mockTrades as never,
			ticker24h: mockTicker24h as never,
			fetchedAt: Date.now(),
		});

		expect(order).toContain("candles");
		expect(order).toContain("trades");
		expect(order).toContain("ticker");
	});
});
