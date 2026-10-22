import { getLogger } from "@trading-model/contracts/logger-registry";
import type { CandleInterval } from "@trading-model/contracts/market-data.types";
import type {
	PositiveInt,
	TradingSymbol,
} from "@trading-model/primitives/primitives";
import { SYMBOLS_FAILED_TOTAL, SYMBOLS_SCRAPED_TOTAL } from "../config/metrics";
import type {
	BinanceWorkerOptions,
	BinanceWorkerResult,
} from "../domain/market-data-snapshot";

/** Scrapes one symbol and persists the result (wired by config/container.ts). */
export interface WorkerOrchestratorDeps {
	runWorker(options: BinanceWorkerOptions): Promise<BinanceWorkerResult>;
	persist(result: BinanceWorkerResult): Promise<void>;
}

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

export class WorkerOrchestrator {
	private readonly _maxConcurrency: PositiveInt;

	constructor(
		maxConcurrency: PositiveInt,
		private readonly _symbols: TradingSymbol[],
		private readonly _candleInterval: CandleInterval,
		private readonly _deps: WorkerOrchestratorDeps
	) {
		this._maxConcurrency = maxConcurrency;
	}

	async executeAll(): Promise<void> {
		const limiter = await _createLimiter(this._maxConcurrency);

		const settled = await Promise.allSettled(
			this._symbols.map((symbol) =>
				limiter(async () => {
					const result = await this._deps.runWorker({
						symbol,
						interval: this._candleInterval,
					});
					await this._persist(result);
					return symbol;
				})
			)
		);

		for (const outcome of settled) {
			if (outcome.status === "rejected") {
				getLogger().error("Symbol fetch failed", { error: outcome.reason });
				SYMBOLS_FAILED_TOTAL.inc();
			} else {
				SYMBOLS_SCRAPED_TOTAL.inc();
			}
		}
	}

	private async _persist(data: BinanceWorkerResult): Promise<void> {
		await this._deps.persist(data);
		getLogger().debug("Data persisted");
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
