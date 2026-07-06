import type { HttpClient } from "@trading-model/common/config/http-client";
import { type ServiceId, toServiceId } from "@trading-model/common/domain/primitives";
import {
	AppError,
	serviceNotFoundError,
	serviceUnreachableError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";
import { ServiceResolver } from "./service-resolver";

/**
 * ServiceDiscovery
 *
 * Responsibility:
 * - Provide a simple API to discover a service
 * - Orchestrate cache, address manager, and health checks
 *
 * Constraints:
 * - No direct access to HTTP clients
 * - No internal cache logic beyond orchestration
 * - No direct network logic
 *
 * This class abstracts service resolution and ensures that
 * returned instances are healthy and valid.
 */
export interface ServiceDiscoveryDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

export class ServiceDiscovery {
	private readonly _httpClient: HttpClient;
	private readonly _serviceCache: IServiceCache;
	private readonly _config: AddressManagerConfig;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _discoveryTimeoutMs: number;
	private readonly _resolver: ServiceResolver;

	/**
	 * Creates a new ServiceDiscovery instance.
	 *
	 * @example
	 * ```ts
	 * const discovery = new ServiceDiscovery({ httpClient, serviceCache, config, healthChecker });
	 * ```
	 */
	constructor(deps: ServiceDiscoveryDeps) {
		this._httpClient = deps.httpClient;
		this._serviceCache = deps.serviceCache;
		this._config = deps.config;
		this._healthChecker = deps.healthChecker;
		this._discoveryTimeoutMs = deps.config.discoveryTimeoutMs;
		this._resolver = new ServiceResolver(
			deps.httpClient,
			deps.config,
			deps.serviceCache,
			deps.healthChecker,
			this._discoveryTimeoutMs,
		);
	}

	/**
	 * Returns a healthy instance of the requested service.
	 *
	 * Algorithm:
	 * 1. Check cache
	 * 2. If absent, fetch from Address Manager
	 * 3. Ping the instance to ensure health
	 * 4. If unhealthy, invalidate cache and retry once
	 *
	 * @param serviceName - Name of the service to find.
	 * @returns A healthy ServiceInstance.
	 * @throws ServiceNotFoundError - If the service is not registered.
	 * @throws ServiceUnreachableError - If the service is registered but unhealthy.
	 *
	 * @example
	 * ```ts
	 * const instance = await discovery.findService("user-service");
	 * ```
	 */
	private async _getHealthyCachedInstance(serviceName: string): Promise<ServiceInstance | null> {
		const cachedInstance = await this._serviceCache.get(toServiceId(serviceName));
		if (!cachedInstance) {
			return null;
		}
		const isHealthy = await this._healthChecker.isHealthy(cachedInstance);
		if (isHealthy) {
			return cachedInstance;
		}
		await this._serviceCache.invalidate(toServiceId(serviceName));
		return null;
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		if (this._config.identity.region) {
			return this.findServiceInRegion(serviceName, this._config.identity.region);
		}

		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}

		return this._resolver.resolveAndValidateService(serviceName);
	}

	async findServiceInRegion(
		serviceName: string,
		region: string
	): Promise<ServiceInstance> {
		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}

		return this._resolver.resolveAndValidateServiceInRegion(serviceName, region);
	}

	acquireConnection(_instanceId: string): void {
		// no-op: connection tracking handled by caller
	}

	releaseConnection(_instanceId: string): void {
		// no-op: connection tracking handled by caller
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(serviceName);
	}

}
