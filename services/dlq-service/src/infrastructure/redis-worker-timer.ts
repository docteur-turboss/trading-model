import type { DurationMs } from "@trading-model/common/domain/primitives";
import { logger } from "../config/logger";
import { isShuttingDown } from "../dlq/shared/shutdown-flag";

const RedisWorkerIntervalMs = 1000 as DurationMs;

export class RedisWorkerTimer {
	private _timer: ReturnType<typeof setTimeout> | null = null;

	constructor(private readonly _tick: () => Promise<void>) {}

	start(): void {
		void this._loop();
	}

	stop(): void {
		if (this._timer) {
			clearTimeout(this._timer);
			this._timer = null;
		}
	}

	private async _loop(): Promise<void> {
		if (isShuttingDown()) {
			return;
		}
		try {
			await this._tick();
		} catch (err) {
			logger.error("DLQ Redis queue worker error", {
				error: (err as Error)?.message,
			});
		}
		if (!isShuttingDown()) {
			this._scheduleNext();
		}
	}

	private _scheduleNext(): void {
		this._timer = setTimeout(() => void this._loop(), RedisWorkerIntervalMs);
		this._timer.unref();
	}
}
