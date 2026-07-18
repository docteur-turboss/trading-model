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

interface MarketDataController {
	persist(payload: BinanceWorkerResult): Promise<void>;
}

export const MarketDataController: MarketDataController = new (class {
	async persist(payload: BinanceWorkerResult): Promise<void> {
		const tasks: Promise<void>[] = [];

		this._pushIfHasData(tasks, payload.candles, MarketDataModel.insertCandles);
		this._pushIfHasData(
			tasks,
			payload.recentTrades,
			MarketDataModel.insertTrades
		);
		this._pushIfDefined(
			tasks,
			payload.orderBook,
			MarketDataModel.insertOrderBook
		);
		this._pushIfHasData(tasks, payload.ticker24h, MarketDataModel.insertTicker);

		await Promise.all(tasks);
	}

	private _pushIfHasData<TData>(
		tasks: Promise<void>[],
		data: TData[] | undefined,
		insert: (data: TData[]) => Promise<void>
	): void {
		if (data?.length) {
			tasks.push(insert(data));
		}
	}

	private _pushIfDefined<TData>(
		tasks: Promise<void>[],
		data: TData | undefined,
		insert: (data: TData) => Promise<void>
	): void {
		if (data) {
			tasks.push(insert(data));
		}
	}
})();
