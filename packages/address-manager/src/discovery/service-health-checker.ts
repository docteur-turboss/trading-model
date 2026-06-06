import { HttpClient } from '@trading-model/common/config/http-client';
import { PING_PATH } from '@trading-model/common/server/constants';

import { ServiceLocator, ServiceNameLocator } from './service-locator';
import { ServiceInstance } from '../client/type';

/**
 * ServiceHealthChecker
 *
 * Responsibilities:
 * - Check the availability of a remote service
 * - Apply a strict timeout
 * - Return a boolean indicating service health (no business exceptions)
 *
 * Constraints:
 * - No retry logic
 * - No cache logic
 * - No dependency on ServiceDiscovery
 *
 * This class provides a simple health check mechanism for services
 * by pinging a predefined endpoint and returning a boolean result.
 *
 * Target resolution is delegated to a ServiceLocator strategy, decoupling
 * the health checker from any specific deployment topology (Docker Compose,
 * Kubernetes, direct IP, etc.).
 */
export class ServiceHealthChecker {
  private readonly httpClient: HttpClient;
  private readonly timeoutMs: number;
  private readonly serviceLocator: ServiceLocator;

  /**
   * Creates a new ServiceHealthChecker.
   *
   * @param httpClient - HTTP client used to perform the health check.
   * @param timeoutMs - Maximum duration (in milliseconds) to wait for a response.
   * @param serviceLocator - Strategy for resolving the target hostname of a
   * service instance. Defaults to ServiceNameLocator (uses the logical name).
   */
  constructor(httpClient: HttpClient, timeoutMs: number, serviceLocator?: ServiceLocator) {
    this.httpClient = httpClient;
    this.timeoutMs = timeoutMs;
    this.serviceLocator = serviceLocator ?? new ServiceNameLocator();
  }

  /**
   * Checks whether a service instance is healthy.
   *
   * - Returns `true` if the service responds within the timeout.
   * - Returns `false` if the service does not respond or an error occurs.
   *
   * @param instance - The service instance to check.
   * @returns Promise resolving to `true` if healthy, `false` otherwise.
   */
  async isHealthy(instance: ServiceInstance): Promise<boolean> {
    const url = this.buildPingUrl(instance);

    try {
      await this.httpClient.get(url, {
        timeoutMs: this.timeoutMs,
      });

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Builds the ping URL for the service instance.
   *
   * Convention:
   * - Each service exposes a GET /ping endpoint for health checks.
   *
   * @param instance - The service instance.
   * @returns The full URL to ping.
   *
   * @private
   */
  private buildPingUrl(instance: ServiceInstance): string {
    const hostname = this.serviceLocator.locate(instance);
    return `https://${hostname}:${instance.port}${PING_PATH}`;
  }
}
