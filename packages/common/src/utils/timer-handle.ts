export class TimerHandle {
	private _handle!: ReturnType<typeof setInterval>;

	get isRunning(): boolean {
		return !!this._handle;
	}

	startInterval(callback: () => void, intervalMs: number): void {
		this.stop();
		this._handle = setInterval(callback, intervalMs);
	}

	startTimeout(callback: () => void, delayMs: number): void {
		this.stop();
		this._handle = setTimeout(callback, delayMs);
	}

	stop(): void {
		clearInterval(this._handle);
	}

	unref(): void {
		this._handle.unref();
	}
}
