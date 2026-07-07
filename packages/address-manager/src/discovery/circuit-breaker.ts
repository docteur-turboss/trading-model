import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import { BaseCircuitBreaker } from "@trading-model/common/reliability/base-circuit-breaker";
import { CircuitBreakerLatency } from "./circuit-breaker-latency";
import { CircuitBreakerPersistence } from "./circuit-breaker-persistence";
import { CircuitBreakerRecorder } from "./circuit-breaker-recorder";
import { CircuitBreakerState } from "./circuit-breaker-state";
import {
	type IServiceCache,
	NullServiceCache,
} from "./service-cache.interface";

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

export class CircuitBreaker extends BaseCircuitBreaker {
	private readonly _state: CircuitBreakerState;
	private readonly _latency: CircuitBreakerLatency;
	private readonly _persistence: CircuitBreakerPersistence;
	private readonly _recorder: CircuitBreakerRecorder;

	constructor(options: CircuitBreakerOptions = {}) {
		const failureThreshold = options.failureThreshold ?? 3;
		const halfOpenTimeoutMs = options.halfOpenTimeoutMs ?? 10_000;
		const stateStore = options.stateStore;
		const loadFromStoreCacheTtlMs =
			options.loadFromStoreCacheTtlMs ?? DEFAULT_LOAD_CACHE_TTL_MS;
		const latencyWindowSize =
			options.latencyWindowSize ?? DEFAULT_LATENCY_WINDOW_SIZE;
		const latencyP99ThresholdMs =
			options.latencyP99ThresholdMs ?? DEFAULT_LATENCY_P99_THRESHOLD_MS;

		super({
			failureThreshold,
			cooldownMs: halfOpenTimeoutMs,
		});

		this._state = new CircuitBreakerState(
			failureThreshold,
			halfOpenTimeoutMs,
			(instanceId) => {
				this._persistence.deleteLastLoadTime(instanceId);
				this._persistence.deletePersistedState(instanceId);
				this._latency.deleteWindow(instanceId);
			}
		);
		this._latency = new CircuitBreakerLatency(
			latencyWindowSize,
			latencyP99ThresholdMs
		);
		this._persistence = new CircuitBreakerPersistence(
			stateStore ?? new NullServiceCache(),
			loadFromStoreCacheTtlMs
		);
		this._recorder = new CircuitBreakerRecorder(
			this._state,
			this._latency,
			this._persistence
		);
	}

	async loadFromStore(instanceId: string): Promise<void> {
		await this._recorder.loadFromStore(instanceId);
	}

	check(instanceId: string): CircuitState {
		return this.getState(instanceId);
	}

	isAllowed(instanceId: string): boolean {
		const machine = this._state.getOrCreateMachine(instanceId);
		const currentState = machine.getState(Date.now());
		if (currentState === "closed") {
			return true;
		}
		if (currentState === "open") {
			const now = Date.now();
			const state = this._state.getInstanceState(instanceId);
			const allowed = state
				? this._state.tryHalfOpen(instanceId, state)
				: false;
			if (allowed) {
				this._persistence.persistMachineState(instanceId, machine);
			}
			return allowed;
		}
		return true;
	}

	recordFailure(instanceId: string): void {
		this._recorder.recordFailure(instanceId);
	}

	recordSuccess(instanceId: string): void {
		this._recorder.recordSuccess(instanceId);
	}

	recordLatency(instanceId: string, durationMs: number): void {
		this._recorder.recordLatency(instanceId, durationMs);
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
		return this._recorder.getStateSummary();
	}

	clear(): void {
		this._recorder.clear();
	}
}
