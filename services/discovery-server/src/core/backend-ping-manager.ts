import { logger } from "@trading-model/common/config/logger";
import { REDIS_STATUS } from "@trading-model/common/persistence/redis-constants";
import type { RegistryBackend } from "@trading-model/validation/contracts/service-registry.types";
import type { PubSubInvalidator } from "./pub-sub-invalidator";

export class BackendPingManager {
	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _pubSub: PubSubInvalidator,
		private readonly _isRedisBackend: boolean
	) {}

	isRedisBackend(): boolean {
		return this._isRedisBackend;
	}

	async pingPubSub(): Promise<void> {
		if (this._pubSub.client.status === REDIS_STATUS.READY) {
			try {
				await this._pubSub.client.ping();
			} catch {
				logger.warn("PubSub ping failed — cache invalidation degraded");
			}
		}
	}

	async pingBackend(): Promise<boolean> {
		const backend = this._backend as { ping?: () => Promise<boolean> };
		if (typeof backend.ping === "function") {
			try {
				return await backend.ping();
			} catch {
				return false;
			}
		}
		if (this._isRedisBackend) {
			return false;
		}
		try {
			await this._backend.listServiceNames();
			return true;
		} catch {
			return false;
		}
	}
}
