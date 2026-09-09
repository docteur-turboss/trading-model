import { toDurationMs } from "@trading-model/common/domain/primitives";
import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class ArchiveTimerScheduler {
	private readonly _archiveTimer = new TimerHandle();

	start(intervalMs: number, callback: () => Promise<void>): void {
		this._archiveTimer.startInterval(() => {
			callback().catch(() => {});
		}, toDurationMs(intervalMs));
		this._archiveTimer.unref();
	}

	stop(): void {
		this._archiveTimer.stop();
	}
}
