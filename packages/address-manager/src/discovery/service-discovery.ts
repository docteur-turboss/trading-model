import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type InstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import { ConnectionTracker } from "./connection-tracker";
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
	private readonly _connectionTracker: ConnectionTracker;

	constructor(deps: ServiceDiscoveryDeps) {
		this._serviceCache = deps.serviceCache;
		this._config = deps.config;
		this._healthChecker = deps.healthChecker;
		this._resolver = new ServiceResolver(deps);
		this._connectionTracker = new ConnectionTracker();
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
		this._connectionTracker.acquire(instanceId);
	}

	releaseConnection(instanceId: InstanceId): void {
		this._connectionTracker.release(instanceId);
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(toServiceId(serviceName));
	}
}
