import { HttpClient } from '@trading-model/common/config/http-client';
import { PING_PATH } from '@trading-model/common/server/constants';

import { DnsResolver, IdentityResolver } from './dns-resolver';
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
 * DNS resolution is delegated to a DnsResolver strategy, decoupling the
 * health checker from any specific deployment topology (Docker Compose,
 * Kubernetes, Consul, etc.).
 */
export class ServiceHealthChecker {
  private readonly httpClient: HttpClient;
  private readonly timeoutMs: number;
  private readonly dnsResolver: DnsResolver;

  /**
   * Creates a new ServiceHealthChecker.
   *
   * @param httpClient - HTTP client used to perform the health check.
   * @param timeoutMs - Maximum duration (in milliseconds) to wait for a response.
   * @param dnsResolver - Strategy for resolving service names to DNS hostnames.
   * Defaults to IdentityResolver (uses the service name as-is).
   */
  constructor(httpClient: HttpClient, timeoutMs: number, dnsResolver?: DnsResolver) {
    this.httpClient = httpClient;
    this.timeoutMs = timeoutMs;
    this.dnsResolver = dnsResolver ?? new IdentityResolver();
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
    const hostname = this.dnsResolver.resolve(instance.serviceName);
    return `https://${hostname}:${instance.port}${PING_PATH}`;
  }
}
