interface LatencyWindow {
	samples: number[];
	cursor: number;
	count: number;
}

export class LatencyTracker {
	private readonly _windows = new Map<string, LatencyWindow>();
	private readonly _windowSize: number;
	private readonly _p99ThresholdMs: number;

	constructor(windowSize: number, p99ThresholdMs: number) {
		this._windowSize = windowSize;
		this._p99ThresholdMs = p99ThresholdMs;
	}

	get windowSize(): number {
		return this._windowSize;
	}

	update(key: string, durationMs: number): number | undefined {
		if (this._windowSize <= 0) {
			return;
		}
		const window = this._getOrCreateWindow(key);
		this._recordSample(window, durationMs);
		if (window.count >= 10) {
			return this._checkThreshold(key, window);
		}
	}

	delete(key: string): void {
		this._windows.delete(key);
	}

	clear(): void {
		this._windows.clear();
	}

	private _getOrCreateWindow(key: string): LatencyWindow {
		let window = this._windows.get(key);
		if (!window) {
			window = {
				samples: new Array(this._windowSize).fill(0),
				cursor: 0,
				count: 0,
			};
			this._windows.set(key, window);
		}
		return window;
	}

	private _recordSample(window: LatencyWindow, durationMs: number): void {
		window.samples[window.cursor] = durationMs;
		window.cursor = (window.cursor + 1) % this._windowSize;
		if (window.count < this._windowSize) {
			window.count++;
		}
	}

	private _checkThreshold(
		_key: string,
		window: LatencyWindow
	): number | undefined {
		if (this._p99ThresholdMs <= 0) {
			return;
		}
		const p99 = this._computeP99(window);
		if (p99 > this._p99ThresholdMs) {
			return p99;
		}
	}

	private _computeP99(window: LatencyWindow): number {
		const sorted = window.samples
			.slice(0, window.count)
			.sort((left, right) => left - right);
		const idx = Math.ceil(sorted.length * 0.99) - 1;
		return sorted[Math.max(0, idx)];
	}
}
