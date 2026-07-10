import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { CircuitState } from "./service-cache.interface";

export interface ICircuitStateStore {
	setCircuitState(instanceId: InstanceId, state: CircuitState): Promise<void>;
	getCircuitState(instanceId: InstanceId): Promise<CircuitState | null>;
	deleteCircuitState(instanceId: InstanceId): Promise<void>;
}

export class CircuitStateStore implements ICircuitStateStore {
	private readonly _circuitStates = new Map<InstanceId, CircuitState>();

	setCircuitState(instanceId: InstanceId, state: CircuitState): Promise<void> {
		this._circuitStates.set(instanceId, state);
		return Promise.resolve();
	}

	getCircuitState(instanceId: InstanceId): Promise<CircuitState | null> {
		return Promise.resolve(this._circuitStates.get(instanceId) ?? null);
	}

	deleteCircuitState(instanceId: InstanceId): Promise<void> {
		this._circuitStates.delete(instanceId);
		return Promise.resolve();
	}
}
