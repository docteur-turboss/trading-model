import type { HttpClient } from "@trading-model/common/config/http-client";
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
		const cachedInstance = await this._serviceCache.get(serviceName);
		if (!cachedInstance) {
			return null;
		}
		const isHealthy = await this._healthChecker.isHealthy(cachedInstance);
		if (isHealthy) {
			return cachedInstance;
		}
		await this._serviceCache.invalidate(serviceName);
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

		return this._resolveAndValidateService(serviceName);
	}

	async findServiceInRegion(
		serviceName: string,
		region: string
	): Promise<ServiceInstance> {
		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}

		return this._resolveAndValidateServiceInRegion(serviceName, region);
	}

	/**
	 * Resolves a service instance from the Address Manager
	 * and verifies its availability.
	 *
	 * Performs a single fetch + validation attempt.
	 *
	 * @param serviceName - Name of the service to resolve.
	 * @returns A healthy ServiceInstance.
	 * @throws ServiceNotFoundError - If the service is not registered.
	 * @throws ServiceUnreachableError - If the service is unreachable or unhealthy.
	 *
	 * @private
	 */
	private async _resolveAndValidateService(
		serviceName: string
	): Promise<ServiceInstance> {
		let instances: unknown;

		try {
			instances = await this._httpClient.get<unknown>(
				`${this._config.addressManagerUrl}/services/${serviceName}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
		} catch (error) {
			throw serviceNotFoundError(
				`Service "${serviceName}" not found`,
				{
					cause: normalizeError(error),
				}
			);
		}

		const instance = Array.isArray(instances)
			? (instances as ServiceInstance[])[0]
			: (instances as ServiceInstance);

		if (!instance) {
			throw serviceNotFoundError(
				`Service "${serviceName}" has no registered instances`
			);
		}

		const isHealthy = await this._healthChecker.isHealthy(instance);

		if (!isHealthy) {
			await this._serviceCache.invalidate(serviceName);

			throw serviceUnreachableError(
				`Service "${serviceName}" is unreachable`
			);
		}

		await this._serviceCache.set(serviceName, instance);
		return instance;
	}

	acquireConnection(_instanceId: string): void {
		// no-op: connection tracking handled by caller
	}

	releaseConnection(_instanceId: string): void {
		// no-op: connection tracking handled by caller
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
		try {
			const instances = await this._httpClient.get<ServiceInstance[]>(
				`${this._config.addressManagerUrl}/services/${serviceName}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
			return instances ?? [];
		} catch {
			return [];
		}
	}

	private async _resolveAndValidateServiceInRegion(
		serviceName: string,
		region: string
	): Promise<ServiceInstance> {
		let instances: unknown;
		try {
			instances = await this._httpClient.get<unknown>(
				`${this._config.addressManagerUrl}/services/${serviceName}/region/${region}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
		} catch {
			return this._resolveAndValidateService(serviceName);
		}

		const instanceList = Array.isArray(instances)
			? (instances as ServiceInstance[])
			: [instances as ServiceInstance];

		for (const instance of instanceList) {
			if (instance) {
				const isHealthy = await this._healthChecker.isHealthy(instance);
				if (isHealthy) {
					await this._serviceCache.set(serviceName, instance);
					return instance;
				}
			}
		}

		return this._resolveAndValidateService(serviceName);
	}
}
