interface LatencyWindow {
	samples: number[];
	cursor: number;
	count: number;
}

const DEFAULT_LATENCY_WINDOW_SIZE = 100;
const DEFAULT_LATENCY_P99_THRESHOLD_MS = 5000;

export class LatencyMonitor {
	private readonly _windows = new Map<string, LatencyWindow>();
	private readonly _windowSize: number;
	private readonly _p99ThresholdMs: number;

	constructor(
		windowSize = DEFAULT_LATENCY_WINDOW_SIZE,
		p99ThresholdMs = DEFAULT_LATENCY_P99_THRESHOLD_MS,
	) {
		this._windowSize = windowSize;
		this._p99ThresholdMs = p99ThresholdMs;
	}

	private _getOrCreateWindow(instanceId: string): LatencyWindow {
		let window = this._windows.get(instanceId);
		if (!window) {
			window = {
				samples: new Array(this._windowSize).fill(0),
				cursor: 0,
				count: 0,
			};
			this._windows.set(instanceId, window);
		}
		return window;
	}

	private _addSample(window: LatencyWindow, durationMs: number): void {
		window.samples[window.cursor] = durationMs;
		window.cursor = (window.cursor + 1) % this._windowSize;
		if (window.count < this._windowSize) {
			window.count++;
		}
	}

	record(instanceId: string, durationMs: number): boolean {
		const window = this._getOrCreateWindow(instanceId);
		this._addSample(window, durationMs);
		if (window.count >= 10) {
			const p99 = this._computeP99(window);
			return p99 > this._p99ThresholdMs;
		}
		return false;
	}

	private _computeP99(window: LatencyWindow): number {
		const sorted = window.samples
			.slice(0, window.count)
			.sort((_prev, _next) => _prev - _next);
		const idx = Math.ceil(sorted.length * 0.99) - 1;
		return sorted[Math.max(0, idx)];
	}

	delete(instanceId: string): void {
		this._windows.delete(instanceId);
	}

	clear(): void {
		this._windows.clear();
	}
}
