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

import {
	CANDLES_PERSISTED_TOTAL,
	TICKERS_PERSISTED_TOTAL,
	TRADES_PERSISTED_TOTAL,
} from "../config/metrics";
import type { MarketDataSnapshot } from "../domain/market-data-snapshot";
import type { MarketDataRepositoryPort } from "../domain/ports/market-data-repository.port";

export interface MarketDataController {
	persist(payload: MarketDataSnapshot): Promise<void>;
}

/** Builds the persistence use case on top of a market data repository. */
export function createMarketDataController(
	repository: MarketDataRepositoryPort
): MarketDataController {
	return {
		async persist(payload: MarketDataSnapshot): Promise<void> {
			const { candles, recentTrades, orderBook, ticker24h } = payload;
			const results = await Promise.allSettled([
				candles?.length &&
					(async () => {
						await repository.insertCandles(candles);
						for (const { symbol } of candles) {
							CANDLES_PERSISTED_TOTAL.inc({ symbol });
						}
					})(),
				recentTrades?.length &&
					(async () => {
						await repository.insertTrades(recentTrades);
						TRADES_PERSISTED_TOTAL.inc(recentTrades.length);
					})(),
				orderBook && repository.insertOrderBook(orderBook),
				ticker24h?.length &&
					(async () => {
						await repository.insertTicker(ticker24h);
						TICKERS_PERSISTED_TOTAL.inc(ticker24h.length);
					})(),
			]);

			const failures = results.filter((item) => item.status === "rejected");
			if (failures.length > 0) {
				const errors = failures.map((item) => {
					const rejected = item as PromiseRejectedResult;
					return rejected.reason?.message ?? String(rejected.reason);
				});
				throw new Error(
					`Market data persist failed (${failures.length} type(s)): ${errors.join("; ")}`
				);
			}
		},
	};
}
