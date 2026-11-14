import { normalizeError } from "@trading-model/common/utils/errors";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import { DurationMs } from "@trading-model/primitives/primitives";
import { logger } from "../config/logger";
import { isShuttingDown } from "../shared/shutdown-flag";

const RedisWorkerIntervalMs = DurationMs.of(1000);

export class RedisWorkerTimer {
	private readonly _timer = new TimerHandle();

	constructor(private readonly _tick: () => Promise<void>) {}

	start(): void {
		void this._loop();
	}

	stop(): void {
		this._timer.stop();
	}

	private async _loop(): Promise<void> {
		if (isShuttingDown()) {
			return;
		}
		try {
			await this._tick();
		} catch (err) {
			logger.error("DLQ Redis queue worker error", {
				error: normalizeError(err).message,
			});
		}
		if (!isShuttingDown()) {
			this._scheduleNext();
		}
	}

	private _scheduleNext(): void {
		this._timer.startTimeout(() => void this._loop(), RedisWorkerIntervalMs);
	}
}
