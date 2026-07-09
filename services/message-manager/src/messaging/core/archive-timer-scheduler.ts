import { TimerHandle } from "@trading-model/common/utils/timer-handle";

export class ArchiveTimerScheduler {
	private readonly _archiveTimer = new TimerHandle();

	start(intervalMs: number, callback: () => Promise<void>): void {
		this._archiveTimer.startInterval(() => {
			callback().catch(() => {});
		}, intervalMs);
		this._archiveTimer.unref();
	}

	stop(): void {
		this._archiveTimer.stop();
	}
}
