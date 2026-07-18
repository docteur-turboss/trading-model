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
	constructor(public readonly deps: CachedRegistryLifecycleDeps) {}

	async start(): Promise<void> {
		this.deps.backend.start();

		await this.deps.pubSub.start(this.deps.cache);

		this.deps.healthMonitor.start();
	}

	async ping(): Promise<boolean> {
		if (this.deps.healthMonitor.fallbackActive) {
			return false;
		}
		await this.deps.pingManager.pingPubSub();
		return this.deps.pingManager.pingBackend();
	}

	markUnhealthy(): void {
		this.deps.healthMonitor.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		this.deps.healthMonitor.setFallbackBackend(fallback);
		this.deps.cache.clear();
	}

	stop(): void {
		this.deps.healthMonitor.stop();
		this.deps.cache.clear();
		this.deps.pubSub.stop();
		this.deps.healthMonitor.stopBackend();
	}
}
