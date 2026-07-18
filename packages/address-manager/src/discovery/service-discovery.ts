import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";
import { ServiceResolver } from "./service-resolver";

export interface ServiceDiscoveryDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

export class ServiceDiscovery {
	private readonly _serviceCache: IServiceCache;
	private readonly _config: AddressManagerConfig;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _resolver: ServiceResolver;

	constructor(deps: ServiceDiscoveryDeps) {
		this._serviceCache = deps.serviceCache;
		this._config = deps.config;
		this._healthChecker = deps.healthChecker;
		this._resolver = new ServiceResolver(deps);
	}

	private readonly _connections = new Map<InstanceId, number>();

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

	acquireConnection(instanceId: InstanceId): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	releaseConnection(instanceId: InstanceId): void {
		const count = this._connections.get(instanceId);
		if (count !== undefined) {
			if (count <= 1) {
				this._connections.delete(instanceId);
			} else {
				this._connections.set(instanceId, count - 1);
			}
		}
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(toServiceId(serviceName));
	}
}
