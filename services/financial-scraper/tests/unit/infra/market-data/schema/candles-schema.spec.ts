import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_EXECUTE_INSERT = jest
	.fn<() => Promise<void>>()
	.mockResolvedValue(undefined);
const MOCK_EXECUTE_SELECT_MANY = jest
	.fn<() => Promise<any[]>>()
	.mockResolvedValue([]);

jest.mock("../../../../../src/config/db", () => {
	const mockSelectQuery = {
		where: jest.fn().mockReturnThis(),
		select: jest.fn().mockReturnThis(),
		executeSelectMany: MOCK_EXECUTE_SELECT_MANY,
	};

	const mockInsertQuery = {
		values: jest.fn().mockReturnThis(),
		executeInsert: MOCK_EXECUTE_INSERT,
	};

	return {
		DBConnection: jest.fn(() => ({
			insertInto: jest.fn(() => mockInsertQuery),
			selectFrom: jest.fn(() => mockSelectQuery),
		})),
	};
});

import {
	insertCandles,
	selectCandlesBy,
} from "../../../../../src/infra/market-data/schema/candles-schema";

const MAKE_CANDLE = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	market: "crypto",
	source: "binance",
	interval: "1m",
	low: 50000,
	open: 50100,
	high: 50200,
	close: 50150,
	volume: 100.5,
	trades: 1000,
	timestamp: 1704067200000,
	closeTimestamp: 1704067260000,
	...overrides,
});

describe("candles-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertCandles", () => {
		it("should insert candle data successfully", async () => {
			const data: never[] = [MAKE_CANDLE() as never];
			await insertCandles(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertCandles(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should insert multiple candles", async () => {
			const data: never[] = [
				MAKE_CANDLE({ symbol: "BTCUSDT" }) as never,
				MAKE_CANDLE({ symbol: "ETHUSDT" }) as never,
			];
			await insertCandles(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when first argument is empty array and undefined trades", async () => {
			const data: never[] = [];
			await insertCandles(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should handle null trades field", async () => {
			const data: never[] = [MAKE_CANDLE({ trades: null }) as never];
			await insertCandles(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});
	});

	describe("selectCandlesBy", () => {
		it("should select candles by symbol", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_CANDLE()] as never[]);
			const results = await selectCandlesBy.symbol("BTCUSDT");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select candles by source", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_CANDLE()] as never[]);
			const results = await selectCandlesBy.source("binance");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select candles by timestamp after", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_CANDLE()] as never[]);
			const results = await selectCandlesBy.timestamp.after(
				new Date("2024-01-01")
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select candles by timestamp before", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectCandlesBy.timestamp.before(
				new Date("2024-01-02")
			);
			expect(results).toHaveLength(0);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should return empty array when no candles found", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectCandlesBy.symbol("UNKNOWN");
			expect(results).toEqual([]);
		});
	});
});
