import type { HttpClient } from "@trading-model/common/config/http-client";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import { ServiceFinder } from "./service-finder";
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
	private readonly _finder: ServiceFinder;

	constructor(deps: ServiceDiscoveryDeps) {
		this._serviceCache = deps.serviceCache;
		this._config = deps.config;
		this._healthChecker = deps.healthChecker;
		this._resolver = new ServiceResolver(
			deps.httpClient,
			deps.config,
			deps.serviceCache,
			deps.healthChecker,
			deps.config.discoveryTimeoutMs
		);
		this._finder = new ServiceFinder(
			this._serviceCache,
			this._healthChecker,
			this._resolver,
			this._config
		);
	}

	private readonly _connections = new Map<string, number>();

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		return this._finder.findService(serviceName);
	}

	findServiceInRegion(
		serviceName: ServiceInstanceName,
		region: string
	): Promise<ServiceInstance> {
		return this._finder.findServiceInRegion(serviceName, region);
	}

	acquireConnection(instanceId: string): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	releaseConnection(instanceId: string): void {
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
		return this._finder.findAllServices(serviceName);
	}
}
