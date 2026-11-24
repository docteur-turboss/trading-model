import { beforeEach, describe, expect, it, jest } from "@jest/globals";
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
	insertTicker,
	selectTickerBy,
} from "../../../../../../src/adapters/outbound/persistence/schema/ticker24h.schema";

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

describe("ticker24h-schema", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("insertTicker", () => {
		it("should insert ticker data successfully", async () => {
			const data: never[] = [MAKE_TICKER() as never];
			await insertTicker(data);
			expect(MOCK_QUERY).toHaveBeenCalled();
		});

		it("should do nothing when data array is empty", async () => {
			const data: never[] = [];
			await insertTicker(data);
			expect(MOCK_QUERY).not.toHaveBeenCalled();
		});

		it("should insert multiple tickers", async () => {
			const data: never[] = [
				MAKE_TICKER({ symbol: "BTCUSDT" }) as never,
				MAKE_TICKER({ symbol: "ETHUSDT" }) as never,
			];
			await insertTicker(data);
			expect(MOCK_QUERY).toHaveBeenCalled();
		});
	});

	describe("selectTickerBy", () => {
		beforeEach(() => {
			MOCK_SQL.length = 0;
		});

		it("pages symbol in (timestamp, id) order, limit applied", () =>
			expectPagedSelect(
				(o) => selectTickerBy.symbol(TradingSymbol.of("BTCUSDT"), o),
				"market_tickers",
				"symbol = ?"
			));
		it("pages timestamp in (timestamp, id) order, limit applied", () =>
			expectPagedSelect(
				(o) =>
					selectTickerBy.timestamp(UnixTimestamp.of(Date.UTC(2024, 0, 1)), o),
				"market_tickers",
				"timestamp = ?"
			));

		it("adds the window and the cursor of the page", async () => {
			await selectTickerBy.symbol(TradingSymbol.of("BTCUSDT"), {
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
