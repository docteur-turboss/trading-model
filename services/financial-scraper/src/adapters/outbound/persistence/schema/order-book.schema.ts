import type { OrderBookLevel } from "@trading-model/contracts/market-data.types";
import type { RowDataPacket } from "mysql2";
import { DATABASE } from "../../../../config/db";
import type { OrderBookData } from "../../../../domain/market-data.types";
import { defineUpsert } from "./market-table";

/** `[price, quantity]` pairs, best level first (the Binance depth order). */
function levels(side: Set<OrderBookLevel>): string {
	return JSON.stringify(
		[...side].map(({ price, quantity }) => [Number(price), Number(quantity)])
	);
}

/**
 * Upsert order book snapshots into market_order_books, kept for historical
 * replay (ADR-0053), read back by `selectOrderBooks`. No API route reads them.
 */
export const insertOrderBook = defineUpsert<OrderBookData>({
	table: "market_order_books",
	columns: ["symbol", "market", "source", "timestamp", "bids", "asks"],
	update: ["bids", "asks"],
	mapRow: (item) => [
		item.symbol,
		item.market,
		item.source,
		new Date(item.timestamp),
		levels(item.bids),
		levels(item.asks),
	],
});

/** One stored snapshot: `[price, quantity]` pairs, best level first. */
export interface StoredOrderBook {
	symbol: string;
	market: string;
	source: string;
	timestamp: number;
	bids: number[][];
	asks: number[][];
}

/**
 * Replay read (ADR-0053): the snapshots of a series (symbol, market, source)
 * in `[from, to)` (ms), oldest first, straight from MySQL (equality on the
 * first three primary key columns, then a range on `timestamp`).
 */
export async function selectOrderBooks(
	symbol: string,
	market: string,
	source: string,
	from: number,
	to: number,
	limit: number
): Promise<StoredOrderBook[]> {
	const [rows] = await DATABASE.promise().query<
		(RowDataPacket & { timestamp: Date; bids: number[][]; asks: number[][] })[]
	>(
		`SELECT symbol, timestamp, bids, asks FROM market_order_books
		WHERE symbol = ? AND market = ? AND source = ? AND timestamp >= ? AND timestamp < ?
		ORDER BY timestamp LIMIT ?`,
		[symbol, market, source, new Date(from), new Date(to), limit]
	);
	return rows.map((row) => ({
		symbol,
		market,
		source,
		timestamp: row.timestamp.getTime(),
		bids: row.bids,
		asks: row.asks,
	}));
}
