import os from "node:os";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	PositiveInt,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import cron from "node-cron";
import { WorkerOrchestrator } from "../../../application/worker-orchestrator";
import { workerOrchestratorDeps } from "../../../config/container";
import {
	SCRAPE_CYCLES_TOTAL,
	SCRAPE_DURATION_SECONDS,
} from "../../../config/metrics";

export interface CronConfig {
	schedule: string;
	symbols: TradingSymbol[];
	maxConcurrency?: PositiveInt;
	candleInterval?: CandleInterval;
}

export class BinanceCronOrchestrator {
	private readonly _workerOrchestrator: WorkerOrchestrator;

	constructor(private readonly _config: CronConfig) {
		const cpuBased = os.cpus().length * 2;
		const maxConcurrency =
			_config.maxConcurrency ??
			PositiveInt.of(Math.min(cpuBased, _config.symbols.length));

		this._workerOrchestrator = new WorkerOrchestrator(
			maxConcurrency,
			_config.symbols,
			_config.candleInterval ?? CandleInterval.Min1,
			workerOrchestratorDeps
		);
	}

	public start(): void {
		let isRunning = false;

		cron.schedule(this._config.schedule, async () => {
			if (isRunning) {
				logger.warn("Previous execution still running");
				return;
			}

			isRunning = true;
			const start = performance.now();

			try {
				await this._workerOrchestrator.executeAll();
				SCRAPE_CYCLES_TOTAL.inc({ result: "success" });
			} catch (err) {
				logger.error("Batch execution failed", { error: err });
				SCRAPE_CYCLES_TOTAL.inc({ result: "error" });
			} finally {
				const duration = (performance.now() - start) / 1000;
				SCRAPE_DURATION_SECONDS.observe(duration);
				isRunning = false;
			}
		});
	}
}
