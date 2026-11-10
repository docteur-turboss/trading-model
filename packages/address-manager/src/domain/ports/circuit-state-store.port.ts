import type { InstanceId } from "@trading-model/primitives/primitives";
import type { PersistedCircuitState } from "./service-cache.port";

export interface CircuitStateStorePort {
	setCircuitState(
		instanceId: InstanceId,
		state: PersistedCircuitState
	): Promise<void>;
	getCircuitState(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null>;
	deleteCircuitState(instanceId: InstanceId): Promise<void>;
}
