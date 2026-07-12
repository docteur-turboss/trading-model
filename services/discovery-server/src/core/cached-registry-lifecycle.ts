import type { RegistryBackend } from "@trading-model/validation/contracts/service-registry.types";
import type { BackendPingManager } from "./backend-ping-manager";
import type { CacheManager } from "./cache-manager";
import type { PubSubInvalidator } from "./pub-sub-invalidator";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export interface CachedRegistryLifecycleDeps {
	healthMonitor: RedisHealthMonitor;
	pingManager: BackendPingManager;
	pubSub: PubSubInvalidator;
	cache: CacheManager;
	backend: RegistryBackend;
}

export class CachedRegistryLifecycle {
	constructor(private readonly _deps: CachedRegistryLifecycleDeps) {}

	private get _healthMonitor(): RedisHealthMonitor {
		return this._deps.healthMonitor;
	}
	private get _pingManager(): BackendPingManager {
		return this._deps.pingManager;
	}
	private get _pubSub(): PubSubInvalidator {
		return this._deps.pubSub;
	}
	private get _cache(): CacheManager {
		return this._deps.cache;
	}
	private get _backend(): RegistryBackend {
		return this._deps.backend;
	}

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
