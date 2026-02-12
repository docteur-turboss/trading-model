import { ServiceInstance } from "../client/type";
import { HttpClient } from "../../common/config/httpClient.js";

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

  /**
   * Creates a new ServiceHealthChecker.
   *
   * @param httpClient - HTTP client used to perform the health check.
   * @param timeoutMs - Maximum duration (in milliseconds) to wait for a response.
   *
   * @example
   * ```ts
   * const checker = new ServiceHealthChecker(httpClient, 2000); // 2s timeout
   * ```
   */
  constructor(httpClient: HttpClient, timeoutMs: number) {
    this.httpClient = httpClient;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Checks whether a service instance is healthy.
   *
   * - Returns `true` if the service responds within the timeout.
   * - Returns `false` if the service does not respond or an error occurs.
   *
   * @param instance - The service instance to check.
   * @returns Promise resolving to `true` if healthy, `false` otherwise.
   *
   * @example
   * ```ts
   * const healthy = await checker.isHealthy(instance);
   * if (!healthy) {
   *   console.warn("Service is unreachable");
   * }
   * ```
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
    return `http://${instance.ip}:${instance.port}/ping`;
  }
}