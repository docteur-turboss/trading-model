import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { PersistedCircuitState } from "./service-cache.interface";

export interface ICircuitStateStore {
	setCircuitState(
		instanceId: InstanceId,
		state: PersistedCircuitState
	): Promise<void>;
	getCircuitState(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null>;
	deleteCircuitState(instanceId: InstanceId): Promise<void>;
}
