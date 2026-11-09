import os from "node:os";
import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	PositiveInt,
	type TradingSymbol,
} from "@trading-model/primitives/primitives";
import {
	WorkerOrchestrator,
	type WorkerOrchestratorDeps,
} from "../../../application/worker-orchestrator";
import {
	SCRAPE_CYCLES_TOTAL,
	SCRAPE_DURATION_SECONDS,
} from "../../../config/metrics";
import { type NoOverlapTask, scheduleNoOverlap } from "./no-overlap";

export interface CronConfig {
	schedule: string;
	symbols: TradingSymbol[];
	maxConcurrency?: PositiveInt;
	candleInterval?: CandleInterval;
	/** Source, publisher and persistence of each symbol scrape. */
	deps: WorkerOrchestratorDeps;
}

export class ScrapeCronOrchestrator {
	private readonly _maxConcurrency: PositiveInt;
	private _workerOrchestrator: WorkerOrchestrator;
	/** Its run is a cycle: fetch and persist of every symbol (not the publishes). */
	private _task?: NoOverlapTask;

	constructor(private readonly _config: CronConfig) {
		const cpuBased = os.cpus().length * 2;
		const maxConcurrency =
			_config.maxConcurrency ??
			PositiveInt.of(Math.min(cpuBased, _config.symbols.length));

		this._maxConcurrency = maxConcurrency;
		this._workerOrchestrator = this._createWorker();
	}

	public start(): void {
		// Fresh cursors: after a lost lease, another collector moved them (ADR-0057).
		this._workerOrchestrator = this._createWorker();
		this._task = scheduleNoOverlap(
			this._config.schedule,
			() => this._runCycle(),
			() => logger.warn("Previous execution still running")
		);
	}

	/** Stops scheduling, then waits for the running cycle and its publishes. */
	public async stop(): Promise<void> {
		await this._task?.stop();
		await this._workerOrchestrator.drain();
	}

	private _createWorker(): WorkerOrchestrator {
		return new WorkerOrchestrator(
			this._maxConcurrency,
			this._config.symbols,
			this._config.candleInterval ?? CandleInterval.Min1,
			this._config.deps
		);
	}

	private async _runCycle(): Promise<void> {
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
		}
	}
}
