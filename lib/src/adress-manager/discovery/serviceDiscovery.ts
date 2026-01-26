import {
  ServiceNotFoundError,
  ServiceUnreachableError,
} from "../../common/utils/Errors";
import { AddressManagerConfig } from "adress-manager/config/AddressManagerConfig";
import { ServiceHealthChecker } from "./serviceHealthChecker";
import { ServiceInstance } from "../client/type";
import { ServiceCache } from "./serviceCache";
import { HttpClient } from "config/httpClient";

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
  /**
   * Creates a new ServiceDiscovery instance.
   *
   * @example
   * ```ts
   * const discovery = new ServiceDiscovery(client, cache, healthChecker);
   * ```
   */
  constructor(
    private readonly httpClient: HttpClient,
    private readonly serviceCache: ServiceCache,
    private readonly config: AddressManagerConfig,
    private readonly healthChecker: ServiceHealthChecker,
  ) {}

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
    const cachedInstance = this.serviceCache.get(serviceName);

    if (cachedInstance) {
      const isHealthy = await this.healthChecker.isHealthy(cachedInstance);
      if (isHealthy) {
        return cachedInstance;
      }

      this.serviceCache.invalidate(serviceName);
    }

    return this.resolveAndValidateService(serviceName);
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
  private async resolveAndValidateService(
    serviceName: string
  ): Promise<ServiceInstance> {
    let instance: ServiceInstance;

    try {
      instance = await this.httpClient.get<ServiceInstance>(
        `${this.config.addressManagerUrl}/services/${serviceName}`,
      );
    } catch (error) {
      throw new ServiceNotFoundError(
        `Service "${serviceName}" not found`,
        error
      );
    }

    const isHealthy = await this.healthChecker.isHealthy(instance);

    if (!isHealthy) {
      this.serviceCache.invalidate(serviceName);

      throw new ServiceUnreachableError(
        `Service "${serviceName}" is unreachable`
      );
    }

    this.serviceCache.set(serviceName, instance);
    return instance;
  }
}