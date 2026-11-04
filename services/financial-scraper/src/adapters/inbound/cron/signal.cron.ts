import { logger } from "@trading-model/http/infrastructure/logger";
import cron from "node-cron";
import type { Source } from "../../../domain/signals";

interface Collector {
	collect(source: Source): Promise<void>;
}

/**
 * One cron task per registry source, on its `schedule`: a slow or failing
 * source never delays another. A tick that finds the previous collection of
 * its source still running is skipped.
 */
export class SignalCronScheduler {
	private readonly _tasks: { stop(): unknown }[] = [];
	private readonly _running = new Map<string, Promise<void>>();

	constructor(
		private readonly _sources: readonly Source[],
		private readonly _collector: Collector
	) {}

	start(): void {
		for (const source of this._sources) {
			this._tasks.push(
				cron.schedule(source.schedule, () => this._collect(source))
			);
		}
	}

	/** Stops scheduling, then waits for the collections in progress. */
	async stop(): Promise<void> {
		for (const task of this._tasks) {
			task.stop();
		}
		await Promise.all(this._running.values());
	}

	private async _collect(source: Source): Promise<void> {
		if (this._running.has(source.id)) {
			logger.warn("Previous signal collection still running: tick skipped", {
				source: source.id,
			});
			return;
		}
		const run = this._collector.collect(source).finally(() => {
			this._running.delete(source.id);
		});
		this._running.set(source.id, run);
		await run;
	}
}
