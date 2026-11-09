import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { DurationMs } from "@trading-model/primitives/primitives";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import type { Env } from "./config/env";

/** What the pruner reads from the environment. */
export type PrunerSettings = Pick<Env, "DLQ_PRUNE_INTERVAL_MS" | "MAX_ENTRIES">;

export class DlqPruner {
	private readonly _timer = new TimerHandle();

	constructor(
		private readonly _entries: { prune(maxEntries: number): Promise<number> },
		private readonly _env: PrunerSettings
	) {}

	start(): void {
		if (this._timer.isRunning) {
			return;
		}
		logger.info("Starting periodic DLQ prune", {
			intervalMs: this._env.DLQ_PRUNE_INTERVAL_MS,
		});
		this._timer.startInterval(() => {
			this.prune().catch((err: unknown) => {
				this._logIterationError(err);
			});
		}, DurationMs.of(this._env.DLQ_PRUNE_INTERVAL_MS));
	}

	stop(): void {
		this._timer.stop();
	}

	async prune(): Promise<number> {
		try {
			const pruned = await this._entries.prune(this._env.MAX_ENTRIES);
			if (pruned > 0) {
				metrics.entriesPruned.inc(pruned);
				logger.info(`Pruned ${pruned} old DLQ entries`);
			}
			return pruned;
		} catch (err) {
			return this._handleError(err);
		}
	}

	private _handleError(err: unknown): number {
		logger.error("DLQ periodic prune failed", {
			error: (err as Error)?.message,
		});
		metrics.pruneErrors.inc(1);
		return 0;
	}

	private _logIterationError(err: unknown): void {
		logger.warn("Periodic prune iteration failed", {
			error: (err as Error)?.message,
		});
	}
}
