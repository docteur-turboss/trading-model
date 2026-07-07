import { logger } from "@trading-model/common/config/logger";
import { parseServiceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { CacheManager } from "./cache-manager";
import { HeartbeatThrottleManager } from "./heartbeat-throttle-manager";
import { InstanceCacheFetcher } from "./instance-cache-fetcher";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export class CacheOrchestrator {
	private readonly _throttleManager = new HeartbeatThrottleManager();
	private readonly _fetcher: InstanceCacheFetcher;

	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _cache: CacheManager,
		private readonly _healthMonitor: RedisHealthMonitor
	) {
		this._fetcher = new InstanceCacheFetcher(
			this._backend,
			this._cache,
			this._healthMonitor
		);
	}

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this._fetcher.getInstances(serviceName, pagination);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._fetcher.getInstance(id);
	}

	async refreshCache(serviceName: string): Promise<void> {
		if (
			!(this._healthMonitor.isHealthy || this._healthMonitor.fallbackActive)
		) {
			logger.warn(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				{ serviceName }
			);
			return;
		}
		try {
			const instances = await this._backend.getInstances(
				parseServiceName(serviceName)
			);
			this._cache.set(serviceName, instances);
		} catch {
			logger.warn("Cache refresh failed, serving stale data", { serviceName });
		}
	}

	async onHeartbeatUpdate(
		serviceName: string,
		publish: (name: string) => Promise<void>
	): Promise<void> {
		return this._throttleManager.onHeartbeatUpdate(serviceName, publish);
	}
}
