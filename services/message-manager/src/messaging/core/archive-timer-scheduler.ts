export class ArchiveTimerScheduler {
	private _archiveTimer: ReturnType<typeof setInterval> | null = null;

	start(intervalMs: number, callback: () => Promise<void>): void {
		this._archiveTimer = setInterval(() => {
			callback().catch(() => {});
		}, intervalMs);
		this._archiveTimer.unref();
	}

	stop(): void {
		if (this._archiveTimer) {
			clearInterval(this._archiveTimer);
			this._archiveTimer = null;
		}
	}
}
