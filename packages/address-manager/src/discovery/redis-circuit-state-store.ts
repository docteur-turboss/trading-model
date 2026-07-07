import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type Redis from "ioredis";
import type { CircuitState } from "./service-cache.interface";
import type { ICircuitStateStore } from "./circuit-state-store";

export class RedisCircuitStateStore implements ICircuitStateStore {
	constructor(
		private readonly _redis: Redis,
		private readonly _prefix: string,
		private readonly _ttlSec: number
	) {}

	async setCircuitState(
		instanceId: string,
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

	async getCircuitState(instanceId: string): Promise<CircuitState | null> {
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

	async deleteCircuitState(instanceId: string): Promise<void> {
		try {
			await this._redis.del(this._circuitKey(instanceId));
		} catch (err) {
			logger.warn("Redis circuit state delete failed", {
				instanceId,
				error: normalizeError(err),
			});
		}
	}

	private _circuitKey(instanceId: string): string {
		return `${this._prefix}circuit:${instanceId}`;
	}
}
