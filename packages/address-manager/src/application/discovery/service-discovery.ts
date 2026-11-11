import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { toServiceId } from "@trading-model/primitives/primitives";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../domain/client/type";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import { ServiceResolver } from "./service-resolver";

/** Dependencies of ServiceDiscovery. */
export interface ServiceDiscoveryDeps {
	httpClient: HttpClient;
	serviceCache: ServiceCachePort;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

/** Asks the discovery server for service instances and caches the answers. */
export class ServiceDiscovery {
	private readonly _serviceCache: ServiceCachePort;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _resolver: ServiceResolver;

	constructor(deps: ServiceDiscoveryDeps) {
		this._serviceCache = deps.serviceCache;
		this._healthChecker = deps.healthChecker;
		this._resolver = new ServiceResolver(deps);
	}

	private async _getHealthyCachedInstance(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance | null> {
		const cachedInstance = await this._serviceCache.get(
			toServiceId(serviceName)
		);
		if (!cachedInstance) {
			return null;
		}
		const isHealthy = await this._healthChecker.isHealthy(cachedInstance);
		if (isHealthy) {
			return cachedInstance;
		}
		await this._serviceCache.delete(toServiceId(serviceName));
		return null;
	}

	async findService(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance> {
		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}
		return this._resolver.findService(toServiceId(serviceName));
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(toServiceId(serviceName));
	}
}
