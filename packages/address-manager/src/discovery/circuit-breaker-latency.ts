import { logger } from "@trading-model/common/config/logger";

export interface LatencyWindow {
	samples: number[];
	cursor: number;
	count: number;
}

const DEFAULT_LATENCY_WINDOW_SIZE = 100;
const DEFAULT_LATENCY_P99_THRESHOLD_MS = 5000;

export class CircuitBreakerLatency {
	private readonly _latencyWindows = new Map<string, LatencyWindow>();

	constructor(
		private readonly _latencyWindowSize: number = DEFAULT_LATENCY_WINDOW_SIZE,
		private readonly _latencyP99ThresholdMs: number = DEFAULT_LATENCY_P99_THRESHOLD_MS,
	) {}

	recordLatency(
		instanceId: string,
		durationMs: number,
		onThresholdExceeded: (instanceId: string) => void,
	): void {
		const window = this._getOrCreateLatencyWindow(instanceId);
		this._recordSample(window, durationMs);
		if (window.count >= 10) {
			this._checkLatencyThreshold(instanceId, window, onThresholdExceeded);
		}
	}

	private _getOrCreateLatencyWindow(instanceId: string): LatencyWindow {
		let window = this._latencyWindows.get(instanceId);
		if (!window) {
			window = {
				samples: new Array(this._latencyWindowSize).fill(0),
				cursor: 0,
				count: 0,
			};
			this._latencyWindows.set(instanceId, window);
		}
		return window;
	}

	private _recordSample(window: LatencyWindow, durationMs: number): void {
		window.samples[window.cursor] = durationMs;
		window.cursor = (window.cursor + 1) % this._latencyWindowSize;
		if (window.count < this._latencyWindowSize) {
			window.count++;
		}
	}

	private _checkLatencyThreshold(
		instanceId: string,
		window: LatencyWindow,
		onThresholdExceeded: (instanceId: string) => void,
	): void {
		const p99 = this._computeP99(window);
		if (p99 > this._latencyP99ThresholdMs) {
			onThresholdExceeded(instanceId);
			logger.warn(
				"Circuit breaker: latency threshold exceeded, treating as failure",
				{ instanceId, p99, threshold: this._latencyP99ThresholdMs },
			);
		}
	}

	private _computeP99(window: LatencyWindow): number {
		const sorted = window.samples
			.slice(0, window.count)
			.sort((_prev, _next) => _prev - _next);
		const idx = Math.ceil(sorted.length * 0.99) - 1;
		return sorted[Math.max(0, idx)];
	}

	deleteWindow(instanceId: string): void {
		this._latencyWindows.delete(instanceId);
	}

	clear(): void {
		this._latencyWindows.clear();
	}
}
