import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { SourceType } from "@trading-model/validation/contracts/market-data.types";

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

	const mockDbConnection = {
		insertInto: jest.fn(() => mockInsertQuery),
		selectFrom: jest.fn(() => mockSelectQuery),
	};

	return {
		DBConnection: jest.fn(() => mockDbConnection),
		createDBConnection: jest.fn(() => mockDbConnection),
	};
});

import {
	insertTicker,
	selectTickerBy,
} from "../../../../../src/infra/market-data/schema/ticker24h.schema";

const MAKE_TICKER = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	market: "crypto",
	source: "binance",
	low: 49000,
	high: 51000,
	last: 50500,
	open: 50000,
	volume: 5000.5,
	timestamp: 1704067200000,
	closeTimestamp: 1704153599000,
	...overrides,
});

const BTC = TradingSymbol.of("BTCUSDT");
const _ETH = TradingSymbol.of("ETHUSDT");
const UNKNOWN = TradingSymbol.of("UNKNOWN");

describe("ticker24h-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertTicker", () => {
		it("should insert ticker data successfully", async () => {
			const data: never[] = [MAKE_TICKER() as never];
			await insertTicker(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertTicker(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should insert multiple tickers", async () => {
			const data: never[] = [
				MAKE_TICKER({ symbol: "BTCUSDT" }) as never,
				MAKE_TICKER({ symbol: "ETHUSDT" }) as never,
			];
			await insertTicker(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});
	});

	describe("selectTickerBy", () => {
		it("should select ticker by symbol", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TICKER()] as never[]);
			const results = await selectTickerBy.symbol(BTC);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select ticker by source", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TICKER()] as never[]);
			const results = await selectTickerBy.source(SourceType.Binance);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select ticker by timestamp", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_TICKER()] as never[]);
			const results = await selectTickerBy.timestamp(
				UnixTimestamp.of(new Date("2024-01-01").getTime())
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should return empty array when no ticker found", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectTickerBy.symbol(UNKNOWN);
			expect(results).toEqual([]);
		});
	});
});
