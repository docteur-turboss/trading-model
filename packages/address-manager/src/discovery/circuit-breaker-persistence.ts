import { logger } from "@trading-model/common/config/logger";
import { CircuitState } from "@trading-model/common/domain/circuit-state";
import {
	type InstanceId,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { normalizeError } from "@trading-model/common/utils/errors";
import { DEFAULT_LOAD_CACHE_TTL_MS } from "./circuit-breaker-constants";
import type { ICircuitStateStore } from "./circuit-state-store";

export class CircuitBreakerPersistence {
	private readonly _lastLoadTimes = new Map<InstanceId, number>();

	constructor(
		private readonly _stateStore: ICircuitStateStore,
		private readonly _loadFromStoreCacheTtlMs: number = DEFAULT_LOAD_CACHE_TTL_MS
	) {}

	async loadFromStore(
		instanceId: InstanceId,
		instances: Map<InstanceId, CircuitStateMachine>
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

	persistMachineState(
		instanceId: InstanceId,
		machine: CircuitStateMachine
	): void {
		const stateData = this._buildStateData(machine);
		this._stateStore.setCircuitState(instanceId, stateData).catch((err) => {
			logger.warn("Failed to persist circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	private _buildStateData(
		machine: CircuitStateMachine
	): import("./service-cache.interface").CircuitState {
		const snap = machine.snapshot();
		const now = Date.now();
		return {
			failures: PositiveInt.of(Math.max(1, snap.failures)),
			lastFailureTime: UnixTimestamp.of(
				snap.openUntil > 0 ? snap.openUntil - 30_000 : now
			),
			state: machine.getState(now),
		};
	}

	private _shouldRestoreFromPersisted(
		existingMachine: CircuitStateMachine | undefined,
		persisted: import("./circuit-breaker-state").InstanceState
	): boolean {
		return !existingMachine || persisted.failures > existingMachine.failures;
	}

	private _replayMachine(
		persisted: import("./circuit-breaker-state").InstanceState
	): CircuitStateMachine {
		const machine = new CircuitStateMachine({
			...CircuitStateMachine.defaultConfig(),
			halfOpenMaxAttempts: 1,
		});
		machine.restore({
			failures: persisted.failures,
			openUntil:
				persisted.state === CircuitState.OPEN
					? persisted.lastFailureTime + 30_000
					: 0,
			halfOpenAttempts: persisted.state === CircuitState.HALF_OPEN ? 1 : 0,
		});
		return machine;
	}

	private _isCacheValid(instanceId: InstanceId): boolean {
		const lastLoad = this._lastLoadTimes.get(instanceId) ?? 0;
		return (
			this._loadFromStoreCacheTtlMs > 0 &&
			Date.now() - lastLoad < this._loadFromStoreCacheTtlMs
		);
	}

	private _updateFromPersisted(
		instanceId: InstanceId,
		persisted: import("./circuit-breaker-state").InstanceState,
		instances: Map<InstanceId, CircuitStateMachine>
	): void {
		if (
			this._shouldRestoreFromPersisted(instances.get(instanceId), persisted)
		) {
			instances.set(instanceId, this._replayMachine(persisted));
		}
	}

	deletePersistedState(instanceId: InstanceId): void {
		this._stateStore.deleteCircuitState(instanceId).catch((err) => {
			logger.warn("Failed to delete persisted circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	clearPersistedStates(instances: Map<InstanceId, CircuitStateMachine>): void {
		for (const instanceId of instances.keys()) {
			this.deletePersistedState(instanceId);
		}
	}

	deleteLastLoadTime(instanceId: InstanceId): void {
		this._lastLoadTimes.delete(instanceId);
	}

	clear(): void {
		this._lastLoadTimes.clear();
	}
}
