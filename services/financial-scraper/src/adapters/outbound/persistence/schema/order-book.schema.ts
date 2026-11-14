import type { OrderBookLevel } from "@trading-model/contracts/market-data.types";
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
 * replay (ADR-0053). No API route reads them.
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
