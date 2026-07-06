import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import type { IServiceCache } from "./service-cache.interface";

interface INstanceState {
	failures: number;
	lastFailureTime: number;
	state: CircuitState;
}

interface LatencyWindow {
	samples: number[];
	cursor: number;
	count: number;
}

const MAX_ENTRY_AGE_MS = 5 * 60_000;
const SWEEP_INTERVAL_MS = 60_000;
const DEFAULT_LATENCY_WINDOW_SIZE = 100;
const DEFAULT_LATENCY_P99_THRESHOLD_MS = 5000;
const DEFAULT_LOAD_CACHE_TTL_MS = 2_000;

export interface CircuitBreakerOptions {
	failureThreshold?: number;
	halfOpenTimeoutMs?: number;
	stateStore?: IServiceCache;
	loadFromStoreCacheTtlMs?: number;
	latencyWindowSize?: number;
	latencyP99ThresholdMs?: number;
}

export class CircuitBreaker {
	private readonly _instances = new Map<string, INstanceState>();
	private readonly _failureThreshold: number;
	private readonly _stateStore?: IServiceCache;
	private readonly _loadFromStoreCacheTtlMs: number;
	private readonly _lastLoadTimes = new Map<string, number>();
	private readonly _latencyWindows = new Map<string, LatencyWindow>();
	private readonly _latencyWindowSize: number;
	private readonly _latencyP99ThresholdMs: number;
	private _sweepHandle?: NodeJS.Timeout;
	private readonly _halfOpenTimeoutMs: number;

	constructor(options: CircuitBreakerOptions = {}) {
		this._failureThreshold = options.failureThreshold ?? 3;
		this._halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
		this._stateStore = options.stateStore;
		this._loadFromStoreCacheTtlMs = options.loadFromStoreCacheTtlMs ?? DEFAULT_LOAD_CACHE_TTL_MS;
		this._latencyWindowSize = options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		this._latencyP99ThresholdMs = options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;
		this._sweepHandle = setInterval(
			() => this._sweepStaleEntries(),
			SWEEP_INTERVAL_MS
		);
		this._sweepHandle.unref();
	}

	async loadFromStore(instanceId: string): Promise<void> {
		if (!this._stateStore) {
			return;
		}

		const lastLoad = this._lastLoadTimes.get(instanceId) ?? 0;
		if (
			this._loadFromStoreCacheTtlMs > 0 &&
			Date.now() - lastLoad < this._loadFromStoreCacheTtlMs
		) {
			return;
		}
		this._lastLoadTimes.set(instanceId, Date.now());

		const persisted = await this._stateStore.getCircuitState(instanceId);
		if (persisted) {
			const existing = this._instances.get(instanceId);
			if (!existing || persisted.lastFailureTime > existing.lastFailureTime) {
				this._instances.set(instanceId, {
					failures: persisted.failures,
					lastFailureTime: persisted.lastFailureTime,
					state: persisted.state,
				});
			}
		}
	}

	isAllowed(instanceId: string): boolean {
		const state = this._instances.get(instanceId);
		if (!state || state.state === "closed") {
			return true;
		}

		if (state.state === "open") {
			if (Date.now() - state.lastFailureTime >= this._halfOpenTimeoutMs) {
				state.state = "half-open";
				this._persistState(instanceId, state);
				logger.info("Circuit breaker half-open for instance", { instanceId });
				return true;
			}
			return false;
		}

		return true;
	}

	recordFailure(instanceId: string): void {
		const now = Date.now();
		let state = this._instances.get(instanceId);

		if (!state) {
			state = { failures: 0, lastFailureTime: now, state: "closed" };
			this._instances.set(instanceId, state);
		}

		state.failures++;
		state.lastFailureTime = now;

		if (state.failures >= this._failureThreshold) {
			state.state = "open";
			logger.warn("Circuit breaker opened for instance", {
				instanceId,
				failures: state.failures,
			});
		}

		this._persistState(instanceId, state);
	}

	recordSuccess(instanceId: string): void {
		const state = this._instances.get(instanceId);
		if (!state) {
			return;
		}

		if (state.state === "half-open") {
			logger.info("Circuit breaker closed for instance", { instanceId });
		}

		state.state = "closed";
		state.failures = 0;
		this._lastLoadTimes.delete(instanceId);
		this._latencyWindows.delete(instanceId);
		this._deletePersistedState(instanceId);
	}

	isOpen(instanceId: string): boolean {
		return this._instances.get(instanceId)?.state === "open";
	}

	getState(instanceId: string): CircuitState {
		return this._instances.get(instanceId)?.state ?? "closed";
	}

	getFailureCount(instanceId: string): number {
		return this._instances.get(instanceId)?.failures ?? 0;
	}

	getStateSummary(): Record<CircuitState, number> {
		const summary: Record<CircuitState, number> = {
			closed: 0,
			open: 0,
			"half-open": 0,
		};
		for (const [, state] of this._instances) {
			summary[state.state]++;
		}
		return summary;
	}

	recordLatency(instanceId: string, durationMs: number): void {
		let window = this._latencyWindows.get(instanceId);
		if (!window) {
			window = {
				samples: new Array(this._latencyWindowSize).fill(0),
				cursor: 0,
				count: 0,
			};
			this._latencyWindows.set(instanceId, window);
		}

		window.samples[window.cursor] = durationMs;
		window.cursor = (window.cursor + 1) % this._latencyWindowSize;
		if (window.count < this._latencyWindowSize) {
			window.count++;
		}

		if (window.count >= 10) {
			const p99 = this._computeP99(window);
			if (p99 > this._latencyP99ThresholdMs) {
				this.recordFailure(instanceId);
				logger.warn(
					"Circuit breaker: latency threshold exceeded, treating as failure",
					{
						instanceId,
						p99,
						threshold: this._latencyP99ThresholdMs,
					}
				);
			}
		}
	}

	private _computeP99(window: LatencyWindow): number {
		const sorted = window.samples
			.slice(0, window.count)
			.sort((_prev, _next) => _prev - _next);
		const idx = Math.ceil(sorted.length * 0.99) - 1;
		return sorted[Math.max(0, idx)];
	}

	clear(): void {
		for (const instanceId of this._instances.keys()) {
			this._deletePersistedState(instanceId);
		}
		this._instances.clear();
		this._lastLoadTimes.clear();
		this._latencyWindows.clear();
		if (this._sweepHandle) {
			clearInterval(this._sweepHandle);
			this._sweepHandle = undefined;
		}
	}

	private _sweepStaleEntries(): void {
		const now = Date.now();
		for (const [instanceId, state] of this._instances) {
			if (now - state.lastFailureTime > MAX_ENTRY_AGE_MS) {
				this._instances.delete(instanceId);
				this._lastLoadTimes.delete(instanceId);
				this._latencyWindows.delete(instanceId);
				this._deletePersistedState(instanceId);
			}
		}
	}

	private _persistState(instanceId: string, state: INstanceState): void {
		if (!this._stateStore) {
			return;
		}
		this._stateStore
			.setCircuitState(instanceId, {
				failures: state.failures,
				lastFailureTime: state.lastFailureTime,
				state: state.state,
			})
			.catch((err) => {
				logger.warn("Failed to persist circuit breaker state", {
					instanceId,
					error: normalizeError(err),
				});
			});
	}

	private _deletePersistedState(instanceId: string): void {
		if (!this._stateStore) {
			return;
		}
		this._stateStore.deleteCircuitState(instanceId).catch((err) => {
			logger.warn("Failed to delete persisted circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}
}
