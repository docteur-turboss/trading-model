import type { CandleInterval } from "@trading-model/common/config/event.types";
import { logger } from "@trading-model/common/config/logger";
import type {
	PositiveInt,
	TradingSymbol,
} from "@trading-model/common/domain/primitives";
import { MarketDataController } from "../../infra/market-data/market-data.controller";
import type { BinanceWorkerResult } from "../worker/binance.worker";

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

export class WorkerOrchestrator {
	private readonly _maxConcurrency: PositiveInt;

	constructor(
		maxConcurrency: PositiveInt,
		private readonly _symbols: TradingSymbol[],
		private readonly _candleInterval: CandleInterval
	) {
		this._maxConcurrency = maxConcurrency;
	}

	async executeAll(): Promise<void> {
		const { BinanceWorker } = await import("../worker/binance.worker.js");
		const limiter = await _createLimiter(this._maxConcurrency);

		const results = await Promise.all(
			this._symbols.map((symbol) =>
				limiter(() => {
					const worker = new BinanceWorker({
						symbol,
						interval: this._candleInterval,
					});
					return worker.run();
				})
			)
		);

		await Promise.all(results.map((data) => this._persist(data)));
	}

	private async _persist(data: BinanceWorkerResult): Promise<void> {
		await MarketDataController.persist(data);
		logger.debug("Data persisted");
	}
}

async function _createLimiter(
	maxConcurrency: PositiveInt
): Promise<LimitFunction> {
	const { default: pLimit } = (await import("p-limit")) as unknown as {
		default: (concurrency: number) => LimitFunction;
	};
	return pLimit(maxConcurrency);
}
