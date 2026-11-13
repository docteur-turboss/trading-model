import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	type DurationMs,
	URLString,
} from "@trading-model/primitives/primitives";
import { PING_PATH } from "@trading-model/server-utils/shared/constants";
import {
	type ServiceLocator,
	ServiceNameLocator,
} from "../../../application/discovery/service-locator";
import type { ServiceInstance } from "../../../domain/client/type";

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

/** Checks that a discovered service instance answers its health endpoint. */
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

		// biome-ignore lint/plugin: a failed ping is the negative health signal, not an error
		try {
			await this._httpClient.get(url, {
				timeoutMs: this._timeoutMs,
			});

			return true;
		} catch {
			return false;
		}
	}

	/** The address callers must use for this instance: the one the ping checks. */
	locate(instance: ServiceInstance): string {
		return this._serviceLocator.locate(instance);
	}

	/** Each service exposes GET /ping for health checks. */
	private _buildPingUrl(instance: ServiceInstance): URLString {
		const hostname = this._serviceLocator.locate(instance);
		return URLString.of(`https://${hostname}:${instance.port}${PING_PATH}`);
	}
}
