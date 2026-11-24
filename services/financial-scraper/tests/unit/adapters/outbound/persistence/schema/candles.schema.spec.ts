import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import {
	TradingSymbol,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import {
	expectPagedSelect,
	MOCK_QUERY,
	MOCK_SQL,
	SQL_OF,
} from "../../../../../support/sql-mock";

jest.mock("../../../../../../src/config/db", () =>
	require("../../../../../support/sql-mock").createDbMock()
);

import {
	insertCandles,
	selectCandlesBy,
} from "../../../../../../src/adapters/outbound/persistence/schema/candles.schema";

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

describe("candles.schema", () => {
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

		it("pages symbol in (timestamp, id) order, limit applied", () =>
			expectPagedSelect(
				(o) => selectCandlesBy.symbol(TradingSymbol.of("BTCUSDT"), o),
				"market_candles",
				"symbol = ?"
			));
		it("pages timestamp.after in (timestamp, id) order, limit applied", () =>
			expectPagedSelect(
				(o) =>
					selectCandlesBy.timestamp.after(
						UnixTimestamp.of(Date.UTC(2024, 0, 1)),
						o
					),
				"market_candles",
				"timestamp > ?"
			));

		it("adds the window and the cursor of the page", async () => {
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
