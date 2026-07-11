export class TimerHandle {
	private _handle: ReturnType<typeof setInterval> | null = null;

	get isRunning(): boolean {
		return this._handle !== null;
	}

	startInterval(callback: () => void, intervalMs: number): void {
		this.stop();
		this._handle = setInterval(callback, intervalMs);
		this._handle.unref();
	}

	startTimeout(callback: () => void, delayMs: number): void {
		this.stop();
		this._handle = setTimeout(callback, delayMs);
		this._handle.unref();
	}

	stop(): void {
		if (this._handle !== null) {
			clearInterval(this._handle);
			this._handle = null;
		}
	}

	unref(): void {
		if (this._handle !== null) {
			this._handle.unref();
		}
	}
}
