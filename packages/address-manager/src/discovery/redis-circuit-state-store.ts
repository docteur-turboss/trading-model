import { logger } from "@trading-model/common/config/logger";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ICircuitStateStore } from "./circuit-state-store.interface";
import { RedisStoreAdapter } from "./redis-store-adapter";
import type { RedisStoreConfig } from "./redis-store-config";
import type { PersistedCircuitState } from "./service-cache.interface";

export class RedisCircuitStateStore implements ICircuitStateStore {
	private readonly _adapter: RedisStoreAdapter<PersistedCircuitState>;
	private readonly _ttlMs: number;

	constructor(config: RedisStoreConfig) {
		this._adapter = new RedisStoreAdapter<PersistedCircuitState>(
			config.redis,
			config.prefix,
			config.ttlSec
		);
		this._ttlMs = config.ttlSec * 1000;
	}

	async setCircuitState(
		instanceId: InstanceId,
		state: PersistedCircuitState
	): Promise<void> {
		try {
			const key = this._circuitKey(instanceId);
			await this._adapter.set(key, state, this._ttlMs * 2);
		} catch (err) {
			logger.warn("Redis circuit state set failed", {
				instanceId,
				error: normalizeError(err),
			});
		}
	}

	async getCircuitState(
		instanceId: InstanceId
	): Promise<PersistedCircuitState | null> {
		try {
			const key = this._circuitKey(instanceId);
			return await this._adapter.get(key);
		} catch (err) {
			logger.warn("Redis circuit state get failed", {
				instanceId,
				error: normalizeError(err),
			});
			return null;
		}
	}

	async deleteCircuitState(instanceId: InstanceId): Promise<void> {
		try {
			const key = this._circuitKey(instanceId);
			await this._adapter.delete(key);
		} catch (err) {
			logger.warn("Redis circuit state delete failed", {
				instanceId,
				error: normalizeError(err),
			});
		}
	}

	private _circuitKey(instanceId: InstanceId): string {
		return `circuit:${instanceId}`;
	}
}
