import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { SourceType } from "@trading-model/contracts/market-data.types";
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
	insertTrades,
	selectTradesBy,
} from "../../../../../src/adapters/outbound/persistence/schema/trades.schema";

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
			expect(MOCK_QUERY).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertTrades(data);
			expect(MOCK_QUERY).not.toHaveBeenCalled();
		});

		it("should insert multiple trades", async () => {
			const data: never[] = [
				MAKE_TRADE({ tradeId: 1n }) as never,
				MAKE_TRADE({ tradeId: 2n }) as never,
			];
			await insertTrades(data);
			expect(MOCK_QUERY).toHaveBeenCalled();
		});
	});

	describe("selectTradesBy", () => {
		beforeEach(() => {
			MOCK_SQL.length = 0;
		});

		it("pages symbol in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectTradesBy.symbol(TradingSymbol.of("BTCUSDT"), {
				limit: 3,
			});
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_trades");
			expect(sql).toContain("symbol = ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});
		it("pages source in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectTradesBy.source(SourceType.Binance, {
				limit: 3,
			});
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_trades");
			expect(sql).toContain("source = ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});
		it("pages timestamp in (timestamp, id) order, limit applied", async () => {
			MOCK_ROWS = [];
			const rows = await selectTradesBy.timestamp(
				UnixTimestamp.of(Date.UTC(2024, 0, 1)),
				{ limit: 3 }
			);
			expect(rows).toEqual([]);
			const [{ query, params }] = MOCK_SQL;
			const sql = SQL_OF(query);
			expect(sql).toContain("from market_trades");
			expect(sql).toContain("timestamp = ?");
			expect(sql).toMatch(/order by timestamp, id limit \?$/);
			expect(params.at(-1)).toBe(3);
		});

		it("adds the window and the cursor of the page", async () => {
			MOCK_ROWS = [];
			await selectTradesBy.symbol(TradingSymbol.of("BTCUSDT"), {
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
