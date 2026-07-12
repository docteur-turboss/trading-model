import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	type DurationMs,
	type InstanceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import { PING_PATH } from "@trading-model/server-utils/server/constants";
import type { ServiceInstance } from "../client/type";
import { type ServiceLocator, ServiceNameLocator } from "./service-locator";

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
export interface HealthCheckOptions {
	httpClient: HttpClient;
	timeoutMs: DurationMs;
	serviceLocator?: ServiceLocator;
}

export class ServiceHealthChecker {
	private readonly _httpClient: HttpClient;
	private readonly _timeoutMs: DurationMs;
	private readonly _serviceLocator: ServiceLocator;

	/**
	 * Creates a new ServiceHealthChecker.
	 */
	constructor(options: HealthCheckOptions) {
		this._httpClient = options.httpClient;
		this._timeoutMs = options.timeoutMs;
		this._serviceLocator = options.serviceLocator ?? new ServiceNameLocator();
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
		const url = this._buildPingUrl(instance);

		try {
			await this._httpClient.get(url, {
				timeoutMs: this._timeoutMs,
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
	/**
	 * Stub: latency tracking is delegated to the circuit breaker.
	 * Override in subclasses that need per-instance latency histograms.
	 */
	recordLatency(
		_instanceId: InstanceId,
		_durationMs: number,
		_success: boolean
	): void {}

	private _buildPingUrl(instance: ServiceInstance): URLString {
		const hostname = this._serviceLocator.locate(instance);
		return URLString.of(`https://${hostname}:${instance.port}${PING_PATH}`);
	}
}
