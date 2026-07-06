import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";
import type { BackendPingManager } from "./backend-ping-manager";
import type { CacheManager } from "./cache-manager";
import type { PubSubInvalidator } from "./pub-sub-invalidator";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export class CachedRegistryLifecycle {
	constructor(
		private readonly _healthMonitor: RedisHealthMonitor,
		private readonly _pingManager: BackendPingManager,
		private readonly _pubSub: PubSubInvalidator,
		private readonly _cache: CacheManager,
		private readonly _backend: RegistryBackend
	) {}

	async start(): Promise<void> {
		this._backend.start();

		await this._pubSub.start(this._cache);

		this._healthMonitor.start();
	}

	async ping(): Promise<boolean> {
		if (this._healthMonitor.fallbackActive) {
			return false;
		}
		await this._pingManager.pingPubSub();
		return this._pingManager.pingBackend();
	}

	markUnhealthy(): void {
		this._healthMonitor.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		this._healthMonitor.setFallbackBackend(fallback);
		this._cache.clear();
	}

	stop(): void {
		this._healthMonitor.stop();
		this._cache.clear();
		this._pubSub.stop();
		this._healthMonitor.stopBackend();
	}
}
