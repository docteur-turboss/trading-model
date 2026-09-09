import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { SourceType } from "@trading-model/validation/shared/contracts/market-data.types";

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
	insertOrderBookSnapshot,
	selectOrderBookSnapshotsBy,
} from "../../../../../src/infra/market-data/schema/order-book-snapshot.schema";

const MAKE_SNAPSHOT = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	market: "crypto",
	source: "binance",
	bids: new Set([{ price: 50000, quantity: 0.5 }]),
	asks: new Set([{ price: 50010, quantity: 1.0 }]),
	timestamp: 1704067200000,
	...overrides,
});

describe("order-book-snapshot-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertOrderBookSnapshot", () => {
		it("should insert order book snapshot data successfully", async () => {
			const data: never[] = [MAKE_SNAPSHOT() as never];
			await insertOrderBookSnapshot(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertOrderBookSnapshot(data);
			expect(MOCK_EXECUTE_INSERT).not.toHaveBeenCalled();
		});

		it("should insert multiple snapshots", async () => {
			const data: never[] = [
				MAKE_SNAPSHOT({ symbol: "BTCUSDT" }) as never,
				MAKE_SNAPSHOT({ symbol: "ETHUSDT" }) as never,
			];
			await insertOrderBookSnapshot(data);
			expect(MOCK_EXECUTE_INSERT).toHaveBeenCalled();
		});
	});

	describe("selectOrderBookSnapshotsBy", () => {
		it("should select snapshots by symbol", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_SNAPSHOT()] as never[]);
			const results = await selectOrderBookSnapshotsBy.symbol(
				TradingSymbol.of("BTCUSDT")
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select snapshots by source", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_SNAPSHOT()] as never[]);
			const results = await selectOrderBookSnapshotsBy.source(
				SourceType.Binance
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select snapshots by timestamp after", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([MAKE_SNAPSHOT()] as never[]);
			const results = await selectOrderBookSnapshotsBy.timestamp.after(
				UnixTimestamp.of(new Date("2024-01-01").getTime())
			);
			expect(results).toHaveLength(1);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should select snapshots by timestamp before", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectOrderBookSnapshotsBy.timestamp.before(
				UnixTimestamp.of(new Date("2024-01-02").getTime())
			);
			expect(results).toHaveLength(0);
			expect(MOCK_EXECUTE_SELECT_MANY).toHaveBeenCalled();
		});

		it("should return empty array when no snapshots found", async () => {
			MOCK_EXECUTE_SELECT_MANY.mockResolvedValue([] as never[]);
			const results = await selectOrderBookSnapshotsBy.symbol(
				TradingSymbol.of("UNKNOWN")
			);
			expect(results).toEqual([]);
		});
	});
});
