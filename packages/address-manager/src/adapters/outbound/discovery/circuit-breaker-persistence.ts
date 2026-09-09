import { logger } from "@trading-model/common/config/logger";
import {
	type InstanceId,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ICircuitStateStore } from "../../../domain/discovery/circuit-state-store.interface";
import type { PersistedCircuitState } from "../../../domain/discovery/service-cache.interface";

export class CircuitBreakerPersistence {
	private readonly _lastLoadTimes = new Map<InstanceId, number>();

	constructor(
		private readonly _stateStore: ICircuitStateStore,
		private readonly _loadFromStoreCacheTtlMs: number = 0
	) {}

	async loadFromStore(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null> {
		if (this._isCacheValid(instanceId)) {
			return null;
		}
		this._lastLoadTimes.set(instanceId, Date.now());
		const persisted = await this._stateStore.getCircuitState(instanceId);
		return persisted;
	}

	private _isCacheValid(instanceId: InstanceId): boolean {
		const lastLoad = this._lastLoadTimes.get(instanceId) ?? 0;
		return (
			this._loadFromStoreCacheTtlMs > 0 &&
			Date.now() - lastLoad < this._loadFromStoreCacheTtlMs
		);
	}

	invalidateCache(instanceId: InstanceId): void {
		this._lastLoadTimes.delete(instanceId);
	}

	persistMachineState(
		instanceId: InstanceId,
		machine: CircuitStateMachine,
		halfOpenTimeoutMs: number
	): void {
		const stateData = this._buildStateData(machine, halfOpenTimeoutMs);
		this._stateStore.setCircuitState(instanceId, stateData).catch((err) => {
			logger.warn("Failed to persist circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	private _buildStateData(
		machine: CircuitStateMachine,
		halfOpenTimeoutMs: number
	): PersistedCircuitState {
		const snap = machine.snapshot();
		const now = Date.now();
		return {
			failures: PositiveInt.of(Math.max(1, snap.failures)),
			lastFailureTime: UnixTimestamp.of(
				snap.openUntil > 0 ? snap.openUntil - halfOpenTimeoutMs : now
			),
			state: machine.getState(now),
		};
	}

	deletePersistedState(instanceId: InstanceId): void {
		this._stateStore.deleteCircuitState(instanceId).catch((err) => {
			logger.warn("Failed to delete persisted circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	clearPersistedStates(instances: Map<string, CircuitStateMachine>): void {
		for (const instanceId of instances.keys()) {
			this.deletePersistedState(instanceId as unknown as InstanceId);
		}
	}

	clear(): void {}
}
