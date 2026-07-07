import { logger } from "@trading-model/common/config/logger";
import { CircuitStateMachine } from "@trading-model/common/reliability/circuit-state-machine";
import { normalizeError } from "@trading-model/common/utils/errors";

import type { IServiceCache } from "./service-cache.interface";

const DEFAULT_LOAD_CACHE_TTL_MS = 2_000;

export class CircuitBreakerPersistence {
	private readonly _lastLoadTimes = new Map<string, number>();

	constructor(
		private readonly _stateStore: IServiceCache,
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
		const state = machine.getState(Date.now());
		this._stateStore
			.setCircuitState(instanceId, {
				failures: machine.failures,
				lastFailureTime: Date.now(),
				state,
			})
			.catch((err) => {
				logger.warn("Failed to persist circuit breaker state", {
					instanceId,
					error: normalizeError(err),
				});
			});
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
		persisted: { failures: number; lastFailureTime: number; state: string },
		instances: Map<string, CircuitStateMachine>
	): void {
		const existing = instances.get(instanceId);
		if (!existing || persisted.lastFailureTime > Date.now()) {
			const machine = new CircuitStateMachine({
				failureThreshold: 3,
				cooldownMs: 10_000,
			});
			for (let i = 0; i < persisted.failures; i++) {
				machine.recordFailure(Date.now());
			}
			instances.set(instanceId, machine);
		}
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
