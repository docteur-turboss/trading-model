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
 *
 * Adding a new market data type requires a single registry entry in
 * `buildPersisters` (plus the schema method), instead of editing this class.
 */

import {
	CANDLES_PERSISTED_TOTAL,
	TICKERS_PERSISTED_TOTAL,
	TRADES_PERSISTED_TOTAL,
} from "../config/metrics";
import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "../domain/market-data.types";
import type { BinanceWorkerResult } from "../domain/market-data-snapshot";
import type { MarketDataRepositoryPort } from "../domain/ports/market-data-repository.port";

export interface MarketDataController {
	persist(payload: BinanceWorkerResult): Promise<void>;
}

interface Persister<TData> {
	present: (payload: BinanceWorkerResult) => TData[] | TData | undefined;
	insert: (data: TData[] | TData) => Promise<void>;
}

function hasData<TData>(data: TData[] | TData | undefined): boolean {
	return Array.isArray(data) ? data.length > 0 : data !== undefined;
}

function buildPersisters(
	repository: MarketDataRepositoryPort
): Persister<CandleData | TradeData | OrderBookData | TickerData>[] {
	return [
		{
			present: (payload) => payload.candles,
			insert: async (value) => {
				await repository.insertCandles(value as CandleData[]);
				CANDLES_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
			},
		},
		{
			present: (payload) => payload.recentTrades,
			insert: async (value) => {
				await repository.insertTrades(value as TradeData[]);
				TRADES_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
			},
		},
		{
			present: (payload) => payload.orderBook,
			insert: (value) => repository.insertOrderBook(value as OrderBookData),
		},
		{
			present: (payload) => payload.ticker24h,
			insert: async (value) => {
				await repository.insertTicker(value as TickerData[]);
				TICKERS_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
			},
		},
	];
}

/** Builds the persistence use case on top of a market data repository. */
export function createMarketDataController(
	repository: MarketDataRepositoryPort
): MarketDataController {
	const persisters = buildPersisters(repository);
	return {
		async persist(payload: BinanceWorkerResult): Promise<void> {
			const results = await Promise.allSettled(
				persisters
					.filter(({ present }) => hasData(present(payload)))
					.map(({ present, insert }) => insert(present(payload) as never))
			);

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
