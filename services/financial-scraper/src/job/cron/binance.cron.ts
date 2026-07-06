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
import {
	BinanceWorker,
	type BinanceWorkerResult,
} from "../worker/binance.worker";

type LimitFunction = <TArgs extends unknown[], TResult>(
	fn: (...args: TArgs) => PromiseLike<TResult> | TResult,
	...args: TArgs
) => Promise<TResult>;

import type { CandleInterval } from "@trading-model/common/config/event.types";

/** Configuration for scheduling a BinanceCronOrchestrator instance. */
export interface CronConfig {
	schedule: string; // e.g. "*/1 * * * *"
	symbols: string[];
	maxConcurrency?: number;
	candleInterval?: CandleInterval;
}

export class BinanceCronOrchestrator {
	private readonly _maxConcurrency: number;
	private _isRunning = false;

	constructor(private readonly _config: CronConfig) {
		/**
		 * Default concurrency:
		 * - Number of CPUs * 2 (I/O bound workload)
		 * - Capped by the number of symbols
		 */
		const cpuBased = os.cpus().length * 2;

		this._maxConcurrency =
			_config.maxConcurrency ?? Math.min(cpuBased, _config.symbols.length);
	}

	/**
	 * Starts the cron scheduler.
	 */
	public start(): void {
		cron.schedule(this._config.schedule, () => this._executeCronTick());

		logger.info("Scheduler started", { maxConcurrency: this._maxConcurrency });
	}

	private async _executeCronTick(): Promise<void> {
		if (this._isRunning) {
			logger.warn("Previous execution still running");
			return;
		}

		this._isRunning = true;

		try {
			await this._executeBatch();
		} catch (err) {
			_logBatchError(err);
		} finally {
			this._isRunning = false;
		}
	}
}

function _logBatchError(err: unknown): void {
	if (err instanceof Error) {
		logger.error("Batch execution error", { err: err.message });
	} else {
		logger.error("Unknown batch execution error", { err: String(err) });
	}
}

export class BinanceCronOrchestrator {

	/**
	 * Batch execution with concurrency limiting.
	 */
	private async _executeBatch(): Promise<void> {
		const { default: pLimit } = (await import("p-limit")) as unknown as {
			default: (concurrency: number) => LimitFunction;
		};
		const limiter = pLimit(this._maxConcurrency);

		const tasks = this._config.symbols.map((symbol) =>
			limiter(async () => {
				const worker = new BinanceWorker({
					symbol,
					interval: this._config.candleInterval ?? "1m",
				});

				const result = await worker.run();

				await this.persist(result);
			})
		);

		await Promise.all(tasks);
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
