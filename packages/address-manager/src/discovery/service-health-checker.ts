import { HttpClient } from '@trading-model/common/config/http-client';
import { PING_PATH } from '@trading-model/common/server/constants';

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
 */
export class ServiceHealthChecker {
  private readonly httpClient: HttpClient;
  private readonly timeoutMs: number;
  private readonly dnsNameMap: Record<string, string>;

  /**
   * Creates a new ServiceHealthChecker.
   *
   * @param httpClient - HTTP client used to perform the health check.
   * @param timeoutMs - Maximum duration (in milliseconds) to wait for a response.
   * @param dnsNameMap - Optional mapping from logical service names to
   * deployment-specific DNS names. When empty, the logical service name is used as-is.
   */
  constructor(httpClient: HttpClient, timeoutMs: number, dnsNameMap: Record<string, string> = {}) {
    this.httpClient = httpClient;
    this.timeoutMs = timeoutMs;
    this.dnsNameMap = dnsNameMap;
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
    const hostname = this.resolveDnsName(instance.serviceName);
    return `http://${hostname}:${instance.port}${PING_PATH}`;
  }

  /**
   * Resolves a logical service name to a deployment-specific DNS name.
   * Falls back to the logical name if no mapping is configured.
   *
   * @param serviceName - Logical service name to resolve.
   * @returns The DNS name to use for the health check URL.
   */
  private resolveDnsName(serviceName: string): string {
    return this.dnsNameMap[serviceName] ?? serviceName;
  }
}
