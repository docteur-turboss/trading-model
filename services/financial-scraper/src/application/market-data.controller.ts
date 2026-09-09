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
		insert: (value) => MarketDataModel.insertCandles(value as CandleData[]),
	},
	{
		present: (payload) => payload.recentTrades,
		insert: (value) => MarketDataModel.insertTrades(value as TradeData[]),
	},
	{
		present: (payload) => payload.orderBook,
		insert: (value) => MarketDataModel.insertOrderBook(value as OrderBookData),
	},
	{
		present: (payload) => payload.ticker24h,
		insert: (value) => MarketDataModel.insertTicker(value as TickerData[]),
	},
];

export const MarketDataController: MarketDataController = new (class {
	async persist(payload: BinanceWorkerResult): Promise<void> {
		await Promise.all(
			PERSISTERS.filter(({ present }) => hasData(present(payload))).map(
				({ present, insert }) => insert(present(payload) as never)
			)
		);
	}
})();
