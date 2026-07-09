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

import type { CandleInterval } from "@trading-model/common/config/event.types";
import type { TradingSymbol } from "@trading-model/common/domain/primitives";

/** Configuration for scheduling a BinanceCronOrchestrator instance. */
export interface CronConfig {
	schedule: string;
	symbols: TradingSymbol[];
	maxConcurrency?: number;
	candleInterval?: CandleInterval;
}

export class BinanceCronOrchestrator {
	private readonly _maxConcurrency: number;

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
		let isRunning = false;

		cron.schedule(this._config.schedule, async () => {
			if (isRunning) {
				logger.warn("Previous execution still running");
				return;
			}

			isRunning = true;

			try {
				await this._executeBatch();
			} catch (err) {
				_logBatchError(err);
			} finally {
				isRunning = false;
			}
		});

		logger.info("Scheduler started", { maxConcurrency: this._maxConcurrency });
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

async function _createLimiter(maxConcurrency: number): Promise<LimitFunction> {
	const { default: pLimit } = (await import("p-limit")) as unknown as {
		default: (concurrency: number) => LimitFunction;
	};
	return pLimit(maxConcurrency);
}
