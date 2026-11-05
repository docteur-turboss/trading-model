import { logger } from "@trading-model/http/infrastructure/logger";
import type { Source } from "../../../domain/signals";
import { type NoOverlapTask, scheduleNoOverlap } from "./no-overlap";

interface Collector {
	collect(source: Source): Promise<void>;
}

/**
 * One cron task per registry source, on its `schedule`: a slow or failing
 * source never delays another. A tick that finds the previous collection of
 * its source still running is skipped.
 */
export class SignalCronScheduler {
	private readonly _tasks: NoOverlapTask[] = [];

	constructor(
		private readonly _sources: readonly Source[],
		private readonly _collector: Collector
	) {}

	start(): void {
		for (const source of this._sources) {
			this._tasks.push(
				scheduleNoOverlap(
					source.schedule,
					() => this._collector.collect(source),
					() =>
						logger.warn(
							"Previous signal collection still running: tick skipped",
							{
								source: source.id,
							}
						)
				)
			);
		}
	}

	/** Stops scheduling, then waits for the collections in progress. */
	async stop(): Promise<void> {
		await Promise.all(this._tasks.map((task) => task.stop()));
	}
}
