import type { OrderBookLevel } from "@trading-model/contracts/market-data.types";

import { DATABASE } from "../../../../config/db";
import type { OrderBookData } from "../../../../domain/market-data.types";

const UPSERT_SQL = `
	INSERT INTO market_order_books
		(symbol, market, source, timestamp, bids, asks)
	VALUES ?
	ON DUPLICATE KEY UPDATE
		bids = VALUES(bids),
		asks = VALUES(asks)
`;

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
export const insertOrderBook = async (data: OrderBookData[]): Promise<void> => {
	if (!data.length) {
		return;
	}

	const rows = data.map((item) => [
		item.symbol,
		item.market,
		item.source,
		new Date(item.timestamp),
		levels(item.bids),
		levels(item.asks),
	]);
	await DATABASE.promise().query(UPSERT_SQL, [rows]);
};
