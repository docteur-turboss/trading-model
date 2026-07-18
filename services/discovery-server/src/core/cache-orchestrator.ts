import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { parseServiceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import type { CacheManager } from "./cache-manager";
import { HeartbeatThrottleManager } from "./heartbeat-throttle-manager";
import { InstanceCacheFetcher } from "./instance-cache-fetcher";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export class CacheOrchestrator {
	public readonly throttleManager = new HeartbeatThrottleManager();
	public readonly fetcher: InstanceCacheFetcher;

	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _cache: CacheManager,
		private readonly _healthMonitor: RedisHealthMonitor
	) {
		this.fetcher = new InstanceCacheFetcher(
			this._backend,
			this._cache,
			this._healthMonitor
		);
	}

	private async _refreshFromBackend(
		serviceName: ServiceInstanceName
	): Promise<void> {
		try {
			const instances = await this._backend.getInstances(
				parseServiceName(serviceName)
			);
			this._cache.set(serviceName, instances);
		} catch {
			logger.warn("Cache refresh failed, serving stale data", { serviceName });
		}
	}

	async refreshCache(serviceName: ServiceInstanceName): Promise<void> {
		if (
			!(this._healthMonitor.isHealthy || this._healthMonitor.fallbackActive)
		) {
			logger.warn(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				{ serviceName }
			);
			return;
		}
		await this._refreshFromBackend(serviceName);
	}

	onHeartbeatUpdate(
		serviceName: ServiceInstanceName,
		publish: (name: ServiceInstanceName) => Promise<void>
	): Promise<void> {
		return this.throttleManager.onHeartbeatUpdate(serviceName, publish);
	}
}
