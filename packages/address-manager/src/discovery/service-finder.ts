import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";
import type { ServiceResolver } from "./service-resolver";

export interface ServiceFinderDeps {
	serviceCache: IServiceCache;
	healthChecker: ServiceHealthChecker;
	resolver: ServiceResolver;
	config: AddressManagerConfig;
}

export class ServiceFinder {
	private readonly _serviceCache: IServiceCache;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _resolver: ServiceResolver;
	private readonly _config: AddressManagerConfig;

	constructor(deps: ServiceFinderDeps) {
		this._serviceCache = deps.serviceCache;
		this._healthChecker = deps.healthChecker;
		this._resolver = deps.resolver;
		this._config = deps.config;
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

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		if (this._config.identity.region) {
			return this.findServiceInRegion(
				serviceName,
				this._config.identity.region
			);
		}
		return this._findFromCacheOrResolve(serviceName);
	}

	findServiceInRegion(
		serviceName: ServiceInstanceName,
		region: string
	): Promise<ServiceInstance> {
		return this._findFromCacheOrResolve(serviceName, region);
	}

	private async _findFromCacheOrResolve(
		serviceName: ServiceInstanceName,
		region?: string
	): Promise<ServiceInstance> {
		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}
		return region
			? this._resolver.findServiceInRegion(toServiceId(serviceName), region)
			: this._resolver.findService(toServiceId(serviceName));
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(toServiceId(serviceName));
	}
}
