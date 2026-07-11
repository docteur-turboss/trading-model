import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { parseServiceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import {
	computePagination,
	type PaginationQuery,
} from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { CacheManager } from "./cache-manager";
import type { RedisHealthMonitor } from "./redis-health-monitor";

export class InstanceCacheFetcher {
	constructor(
		private readonly _backend: RegistryBackend,
		private readonly _cache: CacheManager,
		private readonly _healthMonitor: RedisHealthMonitor
	) {}

	getInstances(
		serviceName: ServiceInstanceName,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		if (pagination?.page !== undefined || pagination?.limit !== undefined) {
			return this._getWithPagination(serviceName, pagination);
		}
		if (this._healthMonitor.fallbackActive) {
			return this._fetchFromBackend(serviceName);
		}
		const cached = this._cache.get(serviceName);
		if (cached) {
			return Promise.resolve(cached);
		}
		const stale = this._serveStaleIfUnhealthy(serviceName);
		if (stale !== undefined) {
			return Promise.resolve(stale);
		}
		return this._fetchAndCache(serviceName);
	}

	private async _getWithPagination(
		serviceName: ServiceInstanceName,
		pagination: PaginationQuery
	): Promise<ServiceInstance[]> {
		const all = await this._backend.getInstances(parseServiceName(serviceName));
		const { skip, limit } = computePagination(
			pagination,
			all.length,
			all.length
		);
		return all.slice(skip, skip + limit);
	}
	private _fetchFromBackend(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._backend.getInstances(parseServiceName(serviceName));
	}
	private _serveStaleIfUnhealthy(
		serviceName: ServiceInstanceName
	): ServiceInstance[] | undefined {
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
	}
	private async _fetchAndCache(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		const instances = await this._backend.getInstances(
			parseServiceName(serviceName)
		);
		this._cache.set(serviceName, instances);
		return instances;
	}

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		const { serviceName, instanceId } = id;
		if (this._healthMonitor.fallbackActive) {
			return this._backend.getInstance(id);
		}
		const cached = this._cache.get(
			serviceName as unknown as ServiceInstanceName
		);
		if (cached) {
			return Promise.resolve(
				cached.find((inst: ServiceInstance) => inst.instanceId === instanceId)
			);
		}
		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(
				serviceName as unknown as ServiceInstanceName
			);
			if (stale) {
				return Promise.resolve(
					stale.find((inst: ServiceInstance) => inst.instanceId === instanceId)
				);
			}
		}
		return this._backend.getInstance({ serviceName, instanceId });
	}
}
