import { logger } from "@trading-model/common/config/logger";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { normalizeError } from "@trading-model/common/utils/errors";

import type { ICircuitStateStore } from "./circuit-state-store";
import { DEFAULT_LOAD_CACHE_TTL_MS } from "./circuit-breaker-constants";

export class CircuitBreakerPersistence {
	private readonly _lastLoadTimes = new Map<string, number>();

	constructor(
		private readonly _stateStore: ICircuitStateStore,
		private readonly _loadFromStoreCacheTtlMs: number = DEFAULT_LOAD_CACHE_TTL_MS
	) {}

	async loadFromStore(
		instanceId: string,
		instances: Map<string, CircuitStateMachine>
	): Promise<void> {
		if (this._isCacheValid(instanceId)) {
			return;
		}
		this._lastLoadTimes.set(instanceId, Date.now());
		const persisted = await this._stateStore.getCircuitState(instanceId);
		if (persisted) {
			this._updateFromPersisted(instanceId, persisted, instances);
		}
	}

	persistMachineState(instanceId: string, machine: CircuitStateMachine): void {
		const stateData = this._buildStateData(machine);
		this._stateStore.setCircuitState(instanceId, stateData).catch((err) => {
			logger.warn("Failed to persist circuit breaker state", { instanceId, error: normalizeError(err) });
		});
	}

	private _buildStateData(machine: CircuitStateMachine): import("./circuit-breaker-state").INstanceState {
		return { failures: machine.failures, lastFailureTime: Date.now(), state: machine.getState(Date.now()) };
	}

	private _isCacheValid(instanceId: string): boolean {
		const lastLoad = this._lastLoadTimes.get(instanceId) ?? 0;
		return (
			this._loadFromStoreCacheTtlMs > 0 &&
			Date.now() - lastLoad < this._loadFromStoreCacheTtlMs
		);
	}

	private _updateFromPersisted(
		instanceId: string,
		persisted: import("./circuit-breaker-state").INstanceState,
		instances: Map<string, CircuitStateMachine>
	): void {
		if (this._shouldRestoreFromPersisted(instances.get(instanceId), persisted)) {
			instances.set(instanceId, this._replayMachine(persisted));
		}
	}

	private _shouldRestoreFromPersisted(existing: CircuitStateMachine | undefined, persisted: { lastFailureTime: number }): boolean {
		return !existing || persisted.lastFailureTime > Date.now();
	}

	private _replayMachine(persisted: { failures: number }): CircuitStateMachine {
		const machine = new CircuitStateMachine({ failureThreshold: 3, cooldownMs: 10_000 });
		for (let i = 0; i < persisted.failures; i++) {
			machine.recordFailure(Date.now());
		}
		return machine;
	}

	deletePersistedState(instanceId: string): void {
		this._stateStore.deleteCircuitState(instanceId).catch((err) => {
			logger.warn("Failed to delete persisted circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	clearPersistedStates(instances: Map<string, CircuitStateMachine>): void {
		for (const instanceId of instances.keys()) {
			this.deletePersistedState(instanceId);
		}
	}

	deleteLastLoadTime(instanceId: string): void {
		this._lastLoadTimes.delete(instanceId);
	}

	clear(): void {
		this._lastLoadTimes.clear();
	}
}
