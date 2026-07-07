import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { ENV } from "../config/env";
import { logger } from "../config/logger";
import { metrics } from "../config/metrics";
import { dlqRepository } from "./repository";

export class DlqPruner {
	private readonly _timer = new TimerHandle();

	start(): void {
		if (this._timer.isRunning) {
			return;
		}
		logger.info("Starting periodic DLQ prune", {
			intervalMs: ENV.DLQ_PRUNE_INTERVAL_MS,
		});
		this._timer.startInterval(() => {
			this._prune().catch((err) => {
				this._logIterationError(err);
			});
		}, ENV.DLQ_PRUNE_INTERVAL_MS);
		this._timer.unref();
	}

	stop(): void {
		this._timer.stop();
	}

	async prune(): Promise<number> {
		try {
			const pruned = await dlqRepository.prune(ENV.MAX_ENTRIES);
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
