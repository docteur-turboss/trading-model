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
	insertTrades,
	selectTradesBy,
} from "../../../../../src/infra/market-data/schema/trades.schema";

const MAKE_TRADE = (overrides: Record<string, unknown> = {}) => ({
	side: "buy" as const,
	price: 50000,
	market: "crypto",
	source: "binance",
	symbol: "BTCUSDT",
	tradeId: 123456789n,
	quantity: 0.5,
	timestamp: 1704067200000,
	...overrides,
});

describe("trades-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertTrades", () => {
		it("should insert trade data successfully", async () => {
			const data: never[] = [MAKE_TRADE() as never];
			await insertTrades(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertTrades(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should insert multiple trades", async () => {
			const data: never[] = [
				MAKE_TRADE({ tradeId: 1n }) as never,
				MAKE_TRADE({ tradeId: 2n }) as never,
			];
			await insertTrades(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});
	});

	describe("selectTradesBy", () => {
		it("should select trades by symbol", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TRADE()] as never[]);
			const results = await selectTradesBy.symbol("BTCUSDT");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select trades by source", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TRADE()] as never[]);
			const results = await selectTradesBy.source("binance");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select trades by timestamp", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TRADE()] as never[]);
			const results = await selectTradesBy.timestamp(new Date("2024-01-01"));
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should return empty array when no trades found", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectTradesBy.symbol("UNKNOWN");
			expect(results).toEqual([]);
		});
	});
});
