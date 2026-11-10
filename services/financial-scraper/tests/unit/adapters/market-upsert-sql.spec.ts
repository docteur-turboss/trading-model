import { describe, expect, it, jest } from "@jest/globals";

const query = jest.fn<(...args: any[]) => any>();
jest.mock("../../../src/config/db", () => ({
	DATABASE: { promise: () => ({ query }) },
	createDBConnection: jest.fn(),
}));

import { insertCandles } from "../../../src/adapters/outbound/persistence/schema/candles.schema";
import { insertOrderBook } from "../../../src/adapters/outbound/persistence/schema/order-book.schema";
import { insertTicker } from "../../../src/adapters/outbound/persistence/schema/ticker24h.schema";
import { insertTrades } from "../../../src/adapters/outbound/persistence/schema/trades.schema";

const sqlOf = () =>
	String(query.mock.calls.at(-1)?.[0]).replace(/\s+/g, " ").trim();

// Statements emitted before the shared upsert helper: ingestion dedup depends on them.
const EXPECTED = {
	candles:
		"INSERT INTO market_candles (symbol, market, source, interval_value, open, high, low, close, volume, trades, timestamp, close_timestamp) VALUES ? ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), low = VALUES(low), close = VALUES(close), volume = VALUES(volume), trades = VALUES(trades), close_timestamp = VALUES(close_timestamp)",
	trades:
		"INSERT INTO market_trades (symbol, market, source, trade_id, price, quantity, side, timestamp) VALUES ? ON DUPLICATE KEY UPDATE price = VALUES(price), quantity = VALUES(quantity), side = VALUES(side)",
	ticker:
		"INSERT INTO market_tickers (symbol, market, source, open, high, low, last, volume, timestamp, close_time) VALUES ? ON DUPLICATE KEY UPDATE open = VALUES(open), high = VALUES(high), low = VALUES(low), last = VALUES(last), volume = VALUES(volume), close_time = VALUES(close_time)",
	orderBook:
		"INSERT INTO market_order_books (symbol, market, source, timestamp, bids, asks) VALUES ? ON DUPLICATE KEY UPDATE bids = VALUES(bids), asks = VALUES(asks)",
};

describe("market table upserts", () => {
	it.each([
		["candles", insertCandles, EXPECTED.candles, 12],
		["trades", insertTrades, EXPECTED.trades, 8],
		["ticker", insertTicker, EXPECTED.ticker, 10],
		["orderBook", insertOrderBook, EXPECTED.orderBook, 6],
	] as const)("%s emits the unchanged SQL", async (_n, insert, sql, width) => {
		const item = {
			symbol: "BTCUSDT",
			market: "spot",
			source: "binance",
			timestamp: 1,
			closeTimestamp: 2,
			tradeId: 3,
			bids: new Set(),
			asks: new Set(),
		};
		await (insert as (d: unknown[]) => Promise<void>)([item]);
		expect(sqlOf()).toBe(sql);
		expect(query.mock.calls.at(-1)?.[1][0][0]).toHaveLength(width);
	});

	it("skips the query on empty input", async () => {
		query.mockClear();
		await insertTrades([]);
		expect(query).not.toHaveBeenCalled();
	});
});
