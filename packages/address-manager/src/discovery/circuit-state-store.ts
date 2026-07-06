import type { CircuitState } from "./service-cache.interface";

export class CircuitStateStore {
	private readonly _circuitStates = new Map<string, CircuitState>();

	setCircuitState(instanceId: string, state: CircuitState): Promise<void> {
		this._circuitStates.set(instanceId, state);
		return Promise.resolve();
	}

	getCircuitState(instanceId: string): Promise<CircuitState | null> {
		return Promise.resolve(this._circuitStates.get(instanceId) ?? null);
	}

	deleteCircuitState(instanceId: string): Promise<void> {
		this._circuitStates.delete(instanceId);
		return Promise.resolve();
	}
}
