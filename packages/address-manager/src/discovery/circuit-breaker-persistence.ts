import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import type { INstanceState } from "./circuit-breaker-state";
import type { IServiceCache } from "./service-cache.interface";

const DEFAULT_LOAD_CACHE_TTL_MS = 2_000;

export class CircuitBreakerPersistence {
	private readonly _lastLoadTimes = new Map<string, number>();

	constructor(
		private readonly _stateStore: IServiceCache,
		private readonly _loadFromStoreCacheTtlMs: number = DEFAULT_LOAD_CACHE_TTL_MS,
	) {}

	async loadFromStore(instanceId: string, instances: Map<string, INstanceState>): Promise<void> {
		if (this._isCacheValid(instanceId)) {
			return;
		}
		this._lastLoadTimes.set(instanceId, Date.now());
		const persisted = await this._stateStore.getCircuitState(instanceId);
		if (persisted) {
			this._updateFromPersisted(instanceId, persisted, instances);
		}
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
		instances: Map<string, INstanceState>,
	): void {
		const existing = instances.get(instanceId);
		if (!existing || persisted.lastFailureTime > existing.lastFailureTime) {
			instances.set(instanceId, {
				failures: persisted.failures,
				lastFailureTime: persisted.lastFailureTime,
				state: persisted.state as INstanceState["state"],
			});
		}
	}

	persistState(instanceId: string, state: INstanceState): void {
		this._stateStore.setCircuitState(instanceId, {
			failures: state.failures,
			lastFailureTime: state.lastFailureTime,
			state: state.state,
		}).catch((err) => {
			logger.warn("Failed to persist circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	deletePersistedState(instanceId: string): void {
		this._stateStore.deleteCircuitState(instanceId).catch((err) => {
			logger.warn("Failed to delete persisted circuit breaker state", {
				instanceId,
				error: normalizeError(err),
			});
		});
	}

	clearPersistedStates(instances: Map<string, INstanceState>): void {
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
