import { CandleInterval } from "@trading-model/contracts/market-data.types";
import { logger } from "@trading-model/http/logger";
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
	/** Source and persistence of each symbol scrape. */
	deps: WorkerOrchestratorDeps;
}

/** Host-independent cap: os.cpus() reports the node cores, not the pod CPU limit. */
const DEFAULT_MAX_CONCURRENCY = 8;

export class ScrapeCronOrchestrator {
	private _workerOrchestrator: WorkerOrchestrator;
	/** Its run is a cycle: fetch and persist of every symbol. */
	private _task?: NoOverlapTask;

	constructor(private readonly _config: CronConfig) {
		this._workerOrchestrator = this._createWorker();
	}

	public start(): void {
		// Fresh cursors: after a lost lease, another collector moved them (ADR-0057).
		this._workerOrchestrator = this._createWorker();
		this._task = scheduleNoOverlap(
			"financial-scraper.scrape",
			this._config.schedule,
			(signal) => this._runCycle(signal),
			() => logger.warn("Previous execution still running")
		);
	}

	/** Stops scheduling, then waits for the running cycle. */
	public async stop(): Promise<void> {
		await this._task?.stop();
	}

	private _createWorker(): WorkerOrchestrator {
		return new WorkerOrchestrator(
			PositiveInt.of(
				Math.min(DEFAULT_MAX_CONCURRENCY, this._config.symbols.length)
			),
			this._config.symbols,
			CandleInterval.Min1,
			this._config.deps
		);
	}

	private async _runCycle(signal: AbortSignal): Promise<void> {
		const start = performance.now();
		try {
			await this._workerOrchestrator.executeAll(signal);
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
