import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { CircuitBreakerState } from "./circuit-breaker-state";
import type { CircuitBreakerLatency } from "./circuit-breaker-latency";
import type { CircuitBreakerPersistence } from "./circuit-breaker-persistence";

export class CircuitBreakerRecorder {
	constructor(
		private readonly _state: CircuitBreakerState,
		private readonly _latency: CircuitBreakerLatency,
		private readonly _persistence: CircuitBreakerPersistence,
	) {}

	async loadFromStore(instanceId: string): Promise<void> {
		await this._persistence.loadFromStore(instanceId, this._state.instances);
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

	clear(): void {
		this._persistence.clearPersistedStates(this._state.instances);
		this._state.clear();
		this._persistence.clear();
		this._latency.clear();
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
}
