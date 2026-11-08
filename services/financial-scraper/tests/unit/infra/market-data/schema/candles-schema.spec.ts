import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	CandleInterval,
	SourceType,
} from "@trading-model/contracts/market-data.types";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

/** SQL and parameters the selects sent; rows they get back. */
const MOCK_SQL: Array<{ query: string; params: unknown[] }> = [];
/** Backticks dropped: MySQL quotes only some identifiers. */
const SQL_OF = (query: string) => query.replaceAll("`", "");
let MOCK_ROWS: unknown[] = [];
const MOCK_QUERY = jest
	.fn<(...args: any[]) => Promise<any>>()
	.mockResolvedValue(undefined);

jest.mock("../../../../../src/config/db", () => {
	const {
		MySqlConnection,
	} = require("ts-sql-query/connections/MySqlConnection");
	const {
		MockQueryRunner,
	} = require("ts-sql-query/queryRunners/MockQueryRunner");
	// The real query builder, so the tests see the SQL a select sends.
	const runner = new MockQueryRunner(
		(_type: string, query: string, params: unknown[]) => {
			MOCK_SQL.push({ query, params: [...params] });
			return MOCK_ROWS;
		}
	);
	const connection = class extends MySqlConnection<"DBConnection"> {};
	return {
		createDBConnection: () => new (connection as any)(runner),
		DATABASE: {
			promise: jest.fn((..._args: any[]) => ({ query: MOCK_QUERY })),
		},
	};
});

import {
	insertCandles,
	selectCandlesBy,
} from "../../../../../src/adapters/outbound/persistence/schema/candles-schema";

const MAKE_CANDLE = (overrides: Record<string, unknown> = {}) => ({
	symbol: "BTCUSDT",
	market: "crypto",
	source: "binance",
	interval: CandleInterval.Min1,
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
			expect(MOCK_QUERY).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertCandles(data);
			expect(MOCK_QUERY).not.toHaveBeenCalled();
		});

		it("should insert multiple candles", async () => {
			const data: never[] = [
				MAKE_CANDLE({ symbol: "BTCUSDT" }) as never,
				MAKE_CANDLE({ symbol: "ETHUSDT" }) as never,
			];
			await insertCandles(data);
			expect(MOCK_QUERY).toHaveBeenCalled();
		});

		it("should do nothing when first argument is empty array and undefined trades", async () => {
			const data: never[] = [];
			await insertCandles(data);
			expect(MOCK_QUERY).not.toHaveBeenCalled();
		});

		it("should handle null trades field", async () => {
			const data: never[] = [MAKE_CANDLE({ trades: null }) as never];
			await insertCandles(data);
			expect(MOCK_QUERY).toHaveBeenCalled();
		});
	});

	describe("selectCandlesBy", () => {
		beforeEach(() => {
			MOCK_SQL.length = 0;
		});

		it("pages symbol in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectCandlesBy.symbol(TradingSymbol.of("BTCUSDT"), {
				limit: 3,
			});
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_candles");
			expect(sql).toContain("symbol = ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});
		it("pages source in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectCandlesBy.source(SourceType.Binance, {
				limit: 3,
			});
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_candles");
			expect(sql).toContain("source = ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});
		it("pages timestamp.after in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectCandlesBy.timestamp.after(
				UnixTimestamp.of(Date.UTC(2024, 0, 1)),
				{ limit: 3 }
			);
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_candles");
			expect(sql).toContain("timestamp > ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});
		it("pages timestamp.before in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectCandlesBy.timestamp.before(
				UnixTimestamp.of(Date.UTC(2024, 0, 1)),
				{ limit: 3 }
			);
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_candles");
			expect(sql).toContain("timestamp < ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});

		it("adds the window and the cursor of the page", async () => {
			MOCK_ROWS = [];
			await selectCandlesBy.symbol(TradingSymbol.of("BTCUSDT"), {
				limit: 10,
				after: { timestamp: 5000, id: 7 },
				from: 1000,
				to: 9000,
			});
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("timestamp >= ?");
			expect(sql).toContain("timestamp < ?");
			expect(sql).toContain("(timestamp > ? or (timestamp = ? and id > ?))");
			expect(params).toEqual(
				expect.arrayContaining([
					new Date(1000),
					new Date(9000),
					new Date(5000),
					7,
					10,
				])
			);
		});
	});
});
