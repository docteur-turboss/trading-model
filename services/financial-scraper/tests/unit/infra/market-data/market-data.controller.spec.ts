import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/common/config/event.types";

jest.mock("../../../../src/infra/market-data/market-data.model", () => ({
	MarketDataModel: {
		insertCandles: jest.fn<any>(),
		insertTrades: jest.fn<any>(),
		insertOrderBook: jest.fn<any>(),
		insertTicker: jest.fn<any>(),
	},
}));

import { MarketDataController } from "../../../../src/infra/market-data/market-data.controller";
import { MarketDataModel } from "../../../../src/infra/market-data/market-data.model";

const MOCK_MODEL = jest.mocked(MarketDataModel);

describe("MarketDataController", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should persist candles when payload has candles", async () => {
		const payload: any = {
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.MIN1 }],
			recentTrades: [],
			orderBook: undefined,
			ticker24h: [],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertCandles).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertTrades).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertOrderBook).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTicker).not.toHaveBeenCalled();
	});

	it("should persist trades when payload has recentTrades", async () => {
		const payload: any = {
			candles: [],
			recentTrades: [{ tradeId: 1n }],
			orderBook: undefined,
			ticker24h: [],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertTrades).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertCandles).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertOrderBook).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTicker).not.toHaveBeenCalled();
	});

	it("should persist orderBook when payload has orderBook", async () => {
		const payload: any = {
			candles: [],
			recentTrades: [],
			orderBook: { symbol: "BTCUSDT" },
			ticker24h: [],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertOrderBook).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertCandles).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTrades).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTicker).not.toHaveBeenCalled();
	});

	it("should persist ticker24h when payload has ticker24h", async () => {
		const payload: any = {
			candles: [],
			recentTrades: [],
			orderBook: undefined,
			ticker24h: [{ symbol: "BTCUSDT" }],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertTicker).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertCandles).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTrades).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertOrderBook).not.toHaveBeenCalled();
	});

	it("should persist all data types when payload has everything", async () => {
		const payload: any = {
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.MIN1 }],
			recentTrades: [{ tradeId: 1n }],
			orderBook: { symbol: "BTCUSDT" },
			ticker24h: [{ symbol: "BTCUSDT" }],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertCandles).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertTrades).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertOrderBook).toHaveBeenCalledTimes(1);
		expect(MOCK_MODEL.insertTicker).toHaveBeenCalledTimes(1);
	});

	it("should do nothing when payload has no data", async () => {
		const payload: any = {
			candles: [],
			recentTrades: [],
			orderBook: undefined,
			ticker24h: undefined,
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		expect(MOCK_MODEL.insertCandles).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTrades).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertOrderBook).not.toHaveBeenCalled();
		expect(MOCK_MODEL.insertTicker).not.toHaveBeenCalled();
	});

	it("should propagate error when candle insertion throws", async () => {
		MOCK_MODEL.insertCandles.mockRejectedValue(new Error("DB error"));
		MOCK_MODEL.insertTrades.mockResolvedValue(undefined);
		MOCK_MODEL.insertOrderBook.mockResolvedValue(undefined);
		MOCK_MODEL.insertTicker.mockResolvedValue(undefined);

		const payload: any = {
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.MIN1 }],
			recentTrades: [{ tradeId: 1n }],
			orderBook: { symbol: "BTCUSDT" },
			ticker24h: [{ symbol: "BTCUSDT" }],
			fetchedAt: Date.now(),
		};

		await expect(MarketDataController.persist(payload)).rejects.toThrow(
			"DB error"
		);
	});
});
