import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { ICircuitBreaker } from "@trading-model/common/reliability/circuit-breaker.interface";

import { type IServiceCache, NullServiceCache } from "./service-cache.interface";
import { CircuitBreakerState } from "./circuit-breaker-state";
import { CircuitBreakerLatency } from "./circuit-breaker-latency";
import { CircuitBreakerPersistence } from "./circuit-breaker-persistence";

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

export class CircuitBreaker implements ICircuitBreaker {
	private readonly _state: CircuitBreakerState;
	private readonly _latency: CircuitBreakerLatency;
	private readonly _persistence: CircuitBreakerPersistence;

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold = options.failureThreshold ?? 3;
		const halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
		const stateStore = options.stateStore;
		const loadFromStoreCacheTtlMs = options.loadFromStoreCacheTtlMs ?? DEFAULT_LOAD_CACHE_TTL_MS;
		const latencyWindowSize = options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		const latencyP99ThresholdMs = options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;

		this._state = new CircuitBreakerState(
			failureThreshold,
			halfOpenTimeoutMs,
			(instanceId) => {
				this._persistence.deleteLastLoadTime(instanceId);
				this._persistence.deletePersistedState(instanceId);
				this._latency.deleteWindow(instanceId);
			},
		);
		this._latency = new CircuitBreakerLatency(latencyWindowSize, latencyP99ThresholdMs);
		this._persistence = new CircuitBreakerPersistence(stateStore ?? new NullServiceCache(), loadFromStoreCacheTtlMs);
	}

	async loadFromStore(instanceId: string): Promise<void> {
		await this._persistence.loadFromStore(instanceId, this._state.instances);
	}

	check(instanceId: string): CircuitState {
		return this.getState(instanceId);
	}

	isAllowed(instanceId: string): boolean {
		const state = this._state.getInstanceState(instanceId);
		if (!state || state.state === "closed") {
			return true;
		}
		if (state.state === "open") {
			const allowed = this._state.tryHalfOpen(instanceId, state);
			if (allowed) {
				this._persistence.persistState(instanceId, state);
			}
			return allowed;
		}
		return true;
	}

	recordFailure(instanceId: string): void {
		const now = Date.now();
		const state = this._state.getOrCreateState(instanceId, now);
		state.failures++;
		state.lastFailureTime = now;
		this._state.checkOpenThreshold(instanceId, state);
		this._persistence.persistState(instanceId, state);
	}

	recordSuccess(instanceId: string): void {
		const state = this._state.getInstanceState(instanceId);
		if (!state) {
			return;
		}
		this._state.logHalfOpenClose(instanceId, state);
		state.state = "closed";
		state.failures = 0;
		this._persistence.deleteLastLoadTime(instanceId);
		this._latency.deleteWindow(instanceId);
		this._persistence.deletePersistedState(instanceId);
	}

	recordLatency(instanceId: string, durationMs: number): void {
		this._latency.recordLatency(instanceId, durationMs, (id) => {
			this.recordFailure(id);
		});
	}

	isOpen(instanceId: string): boolean {
		return this._state.getInstanceState(instanceId)?.state === "open";
	}

	getState(instanceId: string): CircuitState {
		return this._state.getInstanceState(instanceId)?.state ?? "closed";
	}

	getFailureCount(instanceId: string): number {
		return this._state.getInstanceState(instanceId)?.failures ?? 0;
	}

	getStateSummary(): Record<CircuitState, number> {
		const summary: Record<CircuitState, number> = {
			closed: 0,
			open: 0,
			"half-open": 0,
		};
		for (const [, state] of this._state.instances) {
			summary[state.state]++;
		}
		return summary;
	}

	clear(): void {
		this._persistence.clearPersistedStates(this._state.instances);
		this._state.clear();
		this._persistence.clear();
		this._latency.clear();
	}
}
