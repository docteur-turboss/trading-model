import { logger } from "@trading-model/common/config/logger";
import { parseServiceName } from "@trading-model/common/config/services.types";
import type { RegistryBackend, ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import { computePagination, type PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { CacheManager } from "./cache-manager";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export class InstanceCacheFetcher {
	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _cache: CacheManager,
		private readonly _healthMonitor: RedisHealthMonitor
	) {}

	async getInstances(serviceName: string, pagination?: PaginationQuery): Promise<ServiceInstance[]> {
		if (pagination?.page !== undefined || pagination?.limit !== undefined) return this._getWithPagination(serviceName, pagination);
		if (this._healthMonitor.fallbackActive) return this._fetchFromBackend(serviceName);
		const cached = this._cache.get(serviceName);
		if (cached) return cached;
		const stale = this._serveStaleIfUnhealthy(serviceName);
		if (stale !== undefined) return stale;
		return this._fetchAndCache(serviceName);
	}

	private async _getWithPagination(serviceName: string, pagination: PaginationQuery): Promise<ServiceInstance[]> {
		const all = await this._backend.getInstances(parseServiceName(serviceName));
		const { skip, limit } = computePagination(pagination, all.length, all.length);
		return all.slice(skip, skip + limit);
	}
	private async _fetchFromBackend(serviceName: string): Promise<ServiceInstance[]> {
		return this._backend.getInstances(parseServiceName(serviceName));
	}
	private _serveStaleIfUnhealthy(serviceName: string): ServiceInstance[] | undefined {
		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) { logger.warn("Backend unhealthy — serving stale cached instance list for", { serviceName }); return stale; }
			logger.warn("Backend unhealthy — no stale data available, returning empty list for", { serviceName });
			return [];
		}
		return undefined;
	}
	private async _fetchAndCache(serviceName: string): Promise<ServiceInstance[]> {
		const instances = await this._backend.getInstances(parseServiceName(serviceName));
		this._cache.set(serviceName, instances);
		return instances;
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		const { serviceName, instanceId } = id;
		if (this._healthMonitor.fallbackActive) return this._backend.getInstance(id);
		const cached = this._cache.get(serviceName);
		if (cached) return cached.find((inst: ServiceInstance) => inst.instanceId === instanceId);
		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) return stale.find((inst: ServiceInstance) => inst.instanceId === instanceId);
		}
		return this._backend.getInstance({ serviceName, instanceId });
	}
}
