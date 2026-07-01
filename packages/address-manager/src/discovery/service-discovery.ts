import { HttpClient } from '@trading-model/common/config/http-client';
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';

import { IServiceCache } from './service-cache.interface';
import { ServiceHealthChecker } from './service-health-checker';
import { ServiceInstance } from '../client/type';
import { AddressManagerConfig } from '../config/address-manager-config';

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
export class ServiceDiscovery {
  private readonly discoveryTimeoutMs: number;

  /**
   * Creates a new ServiceDiscovery instance.
   *
   * @example
   * ```ts
   * const discovery = new ServiceDiscovery(client, cache, healthChecker, config);
   * ```
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly serviceCache: IServiceCache,
    private readonly config: AddressManagerConfig,
    private readonly healthChecker: ServiceHealthChecker
  ) {
    this.discoveryTimeoutMs = config.discoveryTimeoutMs;
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
  async findService(serviceName: string): Promise<ServiceInstance> {
    if (this.config.region) {
      return this.findServiceInRegion(serviceName, this.config.region);
    }

    const cachedInstance = await this.serviceCache.get(serviceName);

    if (cachedInstance) {
      const isHealthy = await this.healthChecker.isHealthy(cachedInstance);
      if (isHealthy) {
        return cachedInstance;
      }

      await this.serviceCache.invalidate(serviceName);
    }

    return this.resolveAndValidateService(serviceName);
  }

  async findServiceInRegion(serviceName: string, region: string): Promise<ServiceInstance> {
    const cachedInstance = await this.serviceCache.get(serviceName);

    if (cachedInstance) {
      const isHealthy = await this.healthChecker.isHealthy(cachedInstance);
      if (isHealthy) {
        return cachedInstance;
      }

      await this.serviceCache.invalidate(serviceName);
    }

    return this.resolveAndValidateServiceInRegion(serviceName, region);
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
  private async resolveAndValidateService(serviceName: string): Promise<ServiceInstance> {
    let instances: unknown;

    try {
      instances = await this.httpClient.get<unknown>(
        `${this.config.addressManagerUrl}/services/${serviceName}`,
        { timeoutMs: this.discoveryTimeoutMs }
      );
    } catch (error) {
      throw new AppError(`Service "${serviceName}" not found`, ErrorCodes.SERVICE_NOT_FOUND, {
        cause: normalizeError(error),
      });
    }

    const instance = Array.isArray(instances)
      ? (instances as ServiceInstance[])[0]
      : (instances as ServiceInstance);

    if (!instance) {
      throw new AppError(
        `Service "${serviceName}" has no registered instances`,
        ErrorCodes.SERVICE_NOT_FOUND
      );
    }

    const isHealthy = await this.healthChecker.isHealthy(instance);

    if (!isHealthy) {
      await this.serviceCache.invalidate(serviceName);

      throw new AppError(`Service "${serviceName}" is unreachable`, ErrorCodes.SERVICE_UNREACHABLE);
    }

    await this.serviceCache.set(serviceName, instance);
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
      const instances = await this.httpClient.get<ServiceInstance[]>(
        `${this.config.addressManagerUrl}/services/${serviceName}`,
        { timeoutMs: this.discoveryTimeoutMs }
      );
      return instances ?? [];
    } catch {
      return [];
    }
  }

  private async resolveAndValidateServiceInRegion(
    serviceName: string,
    region: string
  ): Promise<ServiceInstance> {
    let instances: unknown;
    try {
      instances = await this.httpClient.get<unknown>(
        `${this.config.addressManagerUrl}/services/${serviceName}/region/${region}`,
        { timeoutMs: this.discoveryTimeoutMs }
      );
    } catch {
      return this.resolveAndValidateService(serviceName);
    }

    const instanceList = Array.isArray(instances)
      ? (instances as ServiceInstance[])
      : [instances as ServiceInstance];

    for (const instance of instanceList) {
      if (instance) {
        const isHealthy = await this.healthChecker.isHealthy(instance);
        if (isHealthy) {
          await this.serviceCache.set(serviceName, instance);
          return instance;
        }
      }
    }

    return this.resolveAndValidateService(serviceName);
  }
}
