/**
 * MarketDataController
 * --------------------
 * Application layer receiving the worker payload.
 *
 * - Validates
 * - Transforms into persistable entities
 * - Routes to the repository
 *
 * Agnostic of the provider (Binance today, Bloomberg tomorrow).
 */

import type { BinanceWorkerResult } from "../../job/worker/binance.worker";
import { MarketDataModel } from "./market-data.model";

export const MarketDataController = new (class {
	/** Persist all normalized market-data entities (candles, trades, order book, ticker) from a worker execution to the database. */
	async persist(payload: BinanceWorkerResult): Promise<void> {
		const tasks: Promise<void>[] = [];

		/* ===========================
		 * Candles
		 * =========================== */
		if (payload.candles?.length) {
			tasks.push(MarketDataModel.insertCandles(payload.candles));
		}

		/* ===========================
		 * Trades
		 * =========================== */
		if (payload.recentTrades?.length) {
			tasks.push(MarketDataModel.insertTrades(payload.recentTrades));
		}

		/* ===========================
		 * OrderBook
		 * =========================== */
		if (payload.orderBook) {
			tasks.push(MarketDataModel.insertOrderBook(payload.orderBook));
		}

		// payload.priceTicker
		// payload.bookTicker
		/* ===========================
		 * Ticker
		 * =========================== */
		if (payload.ticker24h?.length) {
			tasks.push(MarketDataModel.insertTicker(payload.ticker24h));
		}

		await Promise.all(tasks);
	}
})();
