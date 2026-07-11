/**
 * BinanceCronOrchestrator
 * -----------------------
 * Intelligent orchestrator for Binance workers.
 *
 * Responsibilities:
 *  - Scheduling via node-cron
 *  - Dynamic worker scaling
 *  - Concurrency control
 *  - Basic backpressure handling
 *
 * Designed for horizontally scaled environments.
 */

import os from "node:os";
import { logger } from "@trading-model/common/config/logger";
import cron from "node-cron";

import { MarketDataController } from "../../infra/market-data/market-data.controller";
import type { BinanceWorkerResult } from "../worker/binance.worker";

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

import { CandleInterval } from "@trading-model/common/config/event.types";
import {
	PositiveInt,
	type TradingSymbol,
} from "@trading-model/common/domain/primitives";

/** Configuration for scheduling a BinanceCronOrchestrator instance. */
export interface CronConfig {
	schedule: string;
	symbols: TradingSymbol[];
	maxConcurrency?: PositiveInt;
	candleInterval?: CandleInterval;
}

export class BinanceCronOrchestrator {
	private readonly _maxConcurrency: PositiveInt;

	constructor(private readonly _config: CronConfig) {
		/**
		 * Default concurrency:
		 * - Number of CPUs * 2 (I/O bound workload)
		 * - Capped by the number of symbols
		 */
		const cpuBased = os.cpus().length * 2;

		this._maxConcurrency =
			_config.maxConcurrency ??
			PositiveInt.of(Math.min(cpuBased, _config.symbols.length));
	}

	/**
	 * Starts the cron scheduler.
	 */
	public start(): void {
		let isRunning = false;

		cron.schedule(this._config.schedule, async () => {
			if (isRunning) {
				logger.warn("Previous execution still running");
				return;
			}

			isRunning = true;

			try {
				await this._executeAllSymbols();
			} catch (err) {
				if (err instanceof Error) {
					_logBatchError(err);
				} else {
					logger.error("Unknown batch execution error", { err });
				}
			} finally {
				isRunning = false;
			}
		});

		logger.info("Scheduler started", { maxConcurrency: this._maxConcurrency });
	}

	/**
	 * Executes a batch run for all configured symbols.
	 */
	private async _executeAllSymbols(): Promise<void> {
		const { BinanceWorker } = await import("../worker/binance.worker");
		const limiter = await _createLimiter(this._maxConcurrency);

		const results = await Promise.all(
			this._config.symbols.map((symbol) =>
				limiter(() => {
					const worker = new BinanceWorker({
						symbol,
						interval: this._config.candleInterval ?? CandleInterval.Min1,
					});
					return worker.run();
				})
			)
		);

		await Promise.all(results.map((data) => this.persist(data)));
	}

	/**
	 * Extension point for persistence.
	 * Can be overridden or injected.
	 */
	protected async persist(data: BinanceWorkerResult): Promise<void> {
		await MarketDataController.persist(data);

		logger.debug("Data persisted");
	}
}

function _logBatchError(error: unknown): void {
	logger.error("Batch execution failed", { error });
}

async function _createLimiter(
	maxConcurrency: PositiveInt
): Promise<LimitFunction> {
	const { default: pLimit } = (await import("p-limit")) as unknown as {
		default: (concurrency: number) => LimitFunction;
	};
	return pLimit(maxConcurrency);
}
