import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { DiscoveryDeps } from "./discovery-deps";
import type { IServiceCache } from "./service-cache.interface";
import { ServiceFinder, type ServiceFinderDeps } from "./service-finder";
import type { ServiceHealthChecker } from "./service-health-checker";
import { ServiceResolver } from "./service-resolver";

export type ServiceDiscoveryDeps = DiscoveryDeps;

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
		this._resolver = new ServiceResolver(deps);
		this._finder = new ServiceFinder({
			serviceCache: this._serviceCache,
			healthChecker: this._healthChecker,
			resolver: this._resolver,
			config: this._config,
		} satisfies ServiceFinderDeps);
	}

	private readonly _connections = new Map<InstanceId, number>();

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		return this._finder.findService(serviceName);
	}

	findServiceInRegion(
		serviceName: ServiceInstanceName,
		region: string
	): Promise<ServiceInstance> {
		return this._finder.findServiceInRegion(serviceName, region);
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
		return this._finder.findAllServices(serviceName);
	}
}
