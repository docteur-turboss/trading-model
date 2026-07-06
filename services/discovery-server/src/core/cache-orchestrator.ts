import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { CacheManager } from "./cache-manager";
import { RedisHealthMonitor } from "./redis-health-monitor";

export class CacheOrchestrator {
	private readonly _heartbeatInvalidationThrottleMs = 5000;
	private _lastHeartbeatInvalidation = new Map<string, number>();

	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _cache: CacheManager,
		private readonly _healthMonitor: RedisHealthMonitor
	) {}

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		if (pagination?.page !== undefined || pagination?.limit !== undefined) {
			const all = await this._backend.getInstances(serviceName as ServiceInstanceName);
			const page = pagination.page ?? 1;
			const limit = pagination.limit ?? all.length;
			const start = (page - 1) * limit;
			return all.slice(start, start + limit);
		}

		if (this._healthMonitor.fallbackActive) {
			return this._backend.getInstances(serviceName as ServiceInstanceName);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached;
		}

		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) {
				logger.warn(
					"Backend unhealthy — serving stale cached instance list for",
					{ serviceName }
				);
				return stale;
			}
			logger.warn(
				"Backend unhealthy — no stale data available, returning empty list for",
				{ serviceName }
			);
			return [];
		}

		const instances = await this._backend.getInstances(serviceName as ServiceInstanceName);
		this._cache.set(serviceName, instances);
		return instances;
	}

	async getInstance(
		id: ServiceIdentity
	): Promise<ServiceInstance | undefined> {
		const { serviceName, instanceId } = id;

		if (this._healthMonitor.fallbackActive) {
			return await this._backend.getInstance(id);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached.find(
				(inst: ServiceInstance) => inst.instanceId === instanceId
			);
		}

		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) {
				return stale.find(
					(inst: ServiceInstance) => inst.instanceId === instanceId
				);
			}
		}

		return await this._backend.getInstance(id);
	}

	async refreshCache(serviceName: string): Promise<void> {
		if (!(this._healthMonitor.isHealthy || this._healthMonitor.fallbackActive)) {
			logger.warn(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				{ serviceName }
			);
			return;
		}
		try {
			const instances = await this._backend.getInstances(serviceName as ServiceInstanceName);
			this._cache.set(serviceName, instances);
		} catch {
			logger.warn("Cache refresh failed, serving stale data", { serviceName });
		}
	}

	async onHeartbeatUpdate(
		serviceName: string,
		publish: (name: string) => Promise<void>
	): Promise<void> {
		const now = Date.now();
		const last = this._lastHeartbeatInvalidation.get(serviceName) ?? 0;
		if (now - last >= this._heartbeatInvalidationThrottleMs) {
			this._lastHeartbeatInvalidation.set(serviceName, now);
			await publish(serviceName);
		}
	}
}
