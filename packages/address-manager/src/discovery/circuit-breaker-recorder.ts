import type { CircuitState } from "@trading-model/common/domain/circuit-state";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { CircuitBreakerLatency } from "./circuit-breaker-latency";
import type { CircuitBreakerPersistence } from "./circuit-breaker-persistence";
import type { CircuitBreakerState } from "./circuit-breaker-state";

export class CircuitBreakerRecorder {
	constructor(
		private readonly _state: CircuitBreakerState,
		private readonly _latency: CircuitBreakerLatency,
		private readonly _persistence: CircuitBreakerPersistence
	) {}

	async loadFromStore(instanceId: InstanceId): Promise<void> {
		await this._persistence.loadFromStore(instanceId, this._state.instances);
	}

	recordFailure(instanceId: InstanceId): void {
		this._state.recordFailure(instanceId);
		this._persistence.persistMachineState(
			instanceId,
			this._state.getOrCreateMachine(instanceId)
		);
	}

	recordSuccess(instanceId: InstanceId): void {
		const state = this._state.getInstanceState(instanceId);
		if (!state) {
			return;
		}
		this._state.logHalfOpenClose(instanceId, state);
		this._state.recordSuccess(instanceId);
		this._persistence.deleteLastLoadTime(instanceId);
		this._latency.deleteWindow(instanceId);
		this._persistence.deletePersistedState(instanceId);
	}

	recordLatency(instanceId: InstanceId, durationMs: number): void {
		this._latency.recordLatency(instanceId, durationMs, (id: InstanceId) => {
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
		const now = Date.now();
		const summary: Record<CircuitState, number> = {
			closed: 0,
			open: 0,
			"half-open": 0,
		};
		for (const [, machine] of this._state.instances) {
			summary[machine.getState(now)]++;
		}
		return summary;
	}
}
