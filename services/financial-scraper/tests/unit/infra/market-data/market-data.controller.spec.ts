import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";

jest.mock(
	"../../../../src/adapters/outbound/persistence/market-data.model",
	() => ({
		MarketDataModel: {
			insertCandles: jest.fn<any>(),
			insertTrades: jest.fn<any>(),
			insertOrderBook: jest.fn<any>(),
			insertTicker: jest.fn<any>(),
		},
	})
);

import { MarketDataModel } from "../../../../src/adapters/outbound/persistence/market-data.model";
import { MarketDataController } from "../../../../src/config/container";
import { CANDLES_PERSISTED_TOTAL } from "../../../../src/config/metrics";

const MOCK_MODEL = jest.mocked(MarketDataModel);

describe("MarketDataController", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		CANDLES_PERSISTED_TOTAL.reset();
	});

	// Issue #598: SymbolMarketDataStale reads the candles persisted per symbol.
	it("should count persisted candles per symbol", async () => {
		const candle = (symbol: string) => ({
			symbol,
			interval: CandleInterval.Min1,
		});
		const payload: any = {
			candles: [candle("BTCUSDT"), candle("BTCUSDT"), candle("ETHUSDT")],
			fetchedAt: Date.now(),
		};

		await MarketDataController.persist(payload);

		const values = (await CANDLES_PERSISTED_TOTAL.get()).values;
		const count = (symbol: string) =>
			values.find((v) => v.labels.symbol === symbol)?.value;
		expect(count("BTCUSDT")).toBe(2);
		expect(count("ETHUSDT")).toBe(1);
	});

	it("should not count candles whose insert failed", async () => {
		MOCK_MODEL.insertCandles.mockRejectedValueOnce(new Error("MySQL down"));
		const payload: any = {
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.Min1 }],
			fetchedAt: Date.now(),
		};

		await expect(MarketDataController.persist(payload)).rejects.toThrow();

		expect((await CANDLES_PERSISTED_TOTAL.get()).values).toEqual([]);
	});

	it("should persist candles when payload has candles", async () => {
		const payload: any = {
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.Min1 }],
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
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.Min1 }],
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
			candles: [{ symbol: "BTCUSDT", interval: CandleInterval.Min1 }],
			recentTrades: [{ tradeId: 1n }],
			orderBook: { symbol: "BTCUSDT" },
			ticker24h: [{ symbol: "BTCUSDT" }],
			fetchedAt: Date.now(),
		};

		await expect(MarketDataController.persist(payload)).rejects.toThrow(
			/Market data persist failed.*DB error/
		);
	});
});
