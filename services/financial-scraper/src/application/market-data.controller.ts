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
 * `PERSISTERS` (plus the schema method), instead of editing this class.
 */

import {
	CANDLES_PERSISTED_TOTAL,
	TICKERS_PERSISTED_TOTAL,
	TRADES_PERSISTED_TOTAL,
} from "../config/metrics";
import { MarketDataModel } from "../domain/market-data.model";
import type {
	CandleData,
	OrderBookData,
	TickerData,
	TradeData,
} from "../infra/market-data/market-data.types";
import type { BinanceWorkerResult } from "../job/worker/binance.worker";

interface MarketDataController {
	persist(payload: BinanceWorkerResult): Promise<void>;
}

interface Persister<TData> {
	present: (payload: BinanceWorkerResult) => TData[] | TData | undefined;
	insert: (data: TData[] | TData) => Promise<void>;
}

function hasData<TData>(data: TData[] | TData | undefined): boolean {
	return Array.isArray(data) ? data.length > 0 : data !== undefined;
}

const PERSISTERS: Persister<
	CandleData | TradeData | OrderBookData | TickerData
>[] = [
	{
		present: (payload) => payload.candles,
		insert: async (value) => {
			await MarketDataModel.insertCandles(value as CandleData[]);
			CANDLES_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
		},
	},
	{
		present: (payload) => payload.recentTrades,
		insert: async (value) => {
			await MarketDataModel.insertTrades(value as TradeData[]);
			TRADES_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
		},
	},
	{
		present: (payload) => payload.orderBook,
		insert: (value) => MarketDataModel.insertOrderBook(value as OrderBookData),
	},
	{
		present: (payload) => payload.ticker24h,
		insert: async (value) => {
			await MarketDataModel.insertTicker(value as TickerData[]);
			TICKERS_PERSISTED_TOTAL.inc(Array.isArray(value) ? value.length : 1);
		},
	},
];

export const MarketDataController: MarketDataController = new (class {
	async persist(payload: BinanceWorkerResult): Promise<void> {
		const results = await Promise.allSettled(
			PERSISTERS.filter(({ present }) => hasData(present(payload))).map(
				({ present, insert }) => insert(present(payload) as never)
			)
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
	}
})();
