import { logger } from "@trading-model/common/config/logger";
import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";
import type { PubSubInvalidator } from "./pub-sub-invalidator";

export class BackendPingManager {
	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _pubSub: PubSubInvalidator,
		private readonly _redisUrlForPubSub?: string
	) {}

	isRedisBackend(): boolean {
		return typeof (this._backend as { ping?: unknown }).ping === "function";
	}

	async pingPubSub(): Promise<void> {
		const pubSubClient = this._pubSub.client;
		if (pubSubClient?.status === "ready") {
			try {
				await pubSubClient.ping();
			} catch {
				logger.warn("PubSub ping failed — cache invalidation degraded");
			}
		}
	}

	async pingBackend(): Promise<boolean> {
		const b = this._backend as { ping?: () => Promise<boolean> };
		if (typeof b.ping === "function") {
			try {
				return await b.ping();
			} catch {
				return false;
			}
		}
		if (this._redisUrlForPubSub) {
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
