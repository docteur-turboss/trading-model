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
	insertBookTicker,
	selectBookTickerBy,
} from "../../../../../src/infra/market-data/schema/book-ticker.schema";

const MAKE_BOOK_TICKER = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	market: "crypto",
	source: "binance",
	bid: 50000,
	ask: 50010,
	bidQty: 0.5,
	askQty: 1.0,
	timestamp: 1704067200000,
	...overrides,
});

describe("book-ticker-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertBookTicker", () => {
		it("should insert book ticker data successfully", async () => {
			const data: never[] = [MAKE_BOOK_TICKER() as never];
			await insertBookTicker(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertBookTicker(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should insert multiple book tickers", async () => {
			const data: never[] = [
				MAKE_BOOK_TICKER({ symbol: "BTCUSDT" }) as never,
				MAKE_BOOK_TICKER({ symbol: "ETHUSDT" }) as never,
			];
			await insertBookTicker(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});
	});

	describe("selectBookTickerBy", () => {
		it("should select book tickers by symbol", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([
				MAKE_BOOK_TICKER(),
			] as never[]);
			const results = await selectBookTickerBy.symbol("BTCUSDT");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select book tickers by source", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([
				MAKE_BOOK_TICKER(),
			] as never[]);
			const results = await selectBookTickerBy.source("binance");
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select book tickers by timestamp after", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([
				MAKE_BOOK_TICKER(),
			] as never[]);
			const results = await selectBookTickerBy.timestamp.after(
				new Date("2024-01-01")
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select book tickers by timestamp before", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectBookTickerBy.timestamp.before(
				new Date("2024-01-02")
			);
			expect(results).toHaveLength(0);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should return empty array when no book tickers found", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectBookTickerBy.symbol("UNKNOWN");
			expect(results).toEqual([]);
		});
	});
});
