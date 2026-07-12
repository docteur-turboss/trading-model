import { logger } from "@trading-model/common/config/logger";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ICircuitStateStore } from "./circuit-state-store";
import type { RedisStoreConfig } from "./redis-store-config";
import type { CircuitState } from "./service-cache.interface";

export class RedisCircuitStateStore implements ICircuitStateStore {
	private readonly _redis: import("ioredis").Redis;
	private readonly _prefix: string;
	private readonly _ttlSec: number;

	constructor(config: RedisStoreConfig) {
		this._redis = config.redis;
		this._prefix = config.prefix;
		this._ttlSec = config.ttlSec;
	}

	async setCircuitState(
		instanceId: InstanceId,
		state: CircuitState
	): Promise<void> {
		try {
			await this._redis.setex(
				this._circuitKey(instanceId),
				this._ttlSec * 2,
				JSON.stringify(state)
			);
		} catch (err) {
			logger.warn("Redis circuit state set failed", {
				instanceId,
				error: normalizeError(err),
			});
		}
	}

	async getCircuitState(instanceId: InstanceId): Promise<CircuitState | null> {
		try {
			const raw = await this._redis.get(this._circuitKey(instanceId));
			if (!raw) {
				return null;
			}
			return JSON.parse(raw) as CircuitState;
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
			await this._redis.del(this._circuitKey(instanceId));
		} catch (err) {
			logger.warn("Redis circuit state delete failed", {
				instanceId,
				error: normalizeError(err),
			});
		}
	}

	private _circuitKey(instanceId: InstanceId): string {
		return `${this._prefix}circuit:${instanceId}`;
	}
}
