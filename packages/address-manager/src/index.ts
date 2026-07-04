import { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { Application } from "express";

import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { MapResolver } from "./discovery/dns-resolver";
import { ServiceCache } from "./discovery/service-cache";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { PING_ROUTES } from "./http/routes/ping.routes";
import { RefreshJob } from "./scheduler/refresh-job";
import { Scheduler } from "./scheduler/scheduler";

/** Maximum registration retry attempts before giving up. */
const MAX_REGISTRATION_RETRIES = 10;

/** Base delay (ms) for exponential backoff between registration retries. */
const REGISTRATION_BASE_DELAY_MS = 1000;

/** Maximum delay (ms) cap for registration retry backoff. */
const REGISTRATION_MAX_DELAY_MS = 30_000;

/**
 * Default export for the Address Manager library.
 *
 * Allows importing the library as:
 * ```ts
 * import AddressManager from "@trading-model/address-manager";
 * ```
 *
 * Responsibilities:
 * - Orchestrates service registration, token management, discovery, and health checks
 * - Coordinates the lifecycle of all sub-systems (HttpClient, TokenManager,
 *   AddressManagerClient, ServiceCache, ServiceHealthChecker, ServiceDiscovery, Scheduler)
 *
 * Each sub-system is independently configurable and testable.
 * This class serves as the composition root that wires them together.
 */
export default class AddressManager {
	private readonly _addressManagerClient: AddressManagerClient;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _serviceDiscovery: ServiceDiscovery;
	private readonly _tokenManager: TokenManager;
	private readonly _serviceCache: ServiceCache;
	private readonly _httpClient: HttpClient;
	private readonly _tokenRefreshIntervalMs: number;
	private readonly _ttlRefreshIntervalMs: number;
	private _shouldRetryRegistration = true;

	constructor(config: AddressManagerConfig) {
		this._httpClient = HttpClient.createWithTls(config);

		this._tokenManager = new TokenManager(this._httpClient, config);
		this._addressManagerClient = new AddressManagerClient(
			this._httpClient,
			this._tokenManager,
			config
		);

		this._serviceCache = new ServiceCache(config.cacheTtlMs);
		this._healthChecker = new ServiceHealthChecker(
			this._httpClient,
			config.servicePingTimeoutMs,
			config.dnsNameMap
				? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
				: undefined
		);

		this._serviceDiscovery = new ServiceDiscovery(
			this._httpClient,
			this._serviceCache,
			config,
			this._healthChecker
		);

		this._tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
		this._ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	/** Resolves a healthy service instance by name. */
	async findService(serviceName: string): Promise<ServiceInstance> {
		return await this._serviceDiscovery.findService(serviceName);
	}

	/** Registers the ping health-check endpoint on the given Express app. */
	listenExpress(app: Application): void {
		app.use(PING_ROUTES);
	}

	/**
	 * Register the service with exponential backoff retry.
	 *
	 * Attempts to register until success, max retries are exhausted,
	 * or `stop()` is called. Each failure is logged with attempt count.
	 */
	private async _retryRegistration(): Promise<void> {
		for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
			if (!this._shouldRetryRegistration) {
				return;
			}

			try {
				const res = await this._addressManagerClient.registerService();
				if (!res) {
					throw new Error("Registration returned no content");
				}
				this._tokenManager.setToken(res.token);
				return;
			} catch (error) {
				logger.error("Service registration failed", {
					attempt,
					maxRetries: MAX_REGISTRATION_RETRIES,
					error: normalizeError(error),
				});

				if (attempt < MAX_REGISTRATION_RETRIES) {
					const delay = Math.min(
						REGISTRATION_BASE_DELAY_MS * 2 ** attempt,
						REGISTRATION_MAX_DELAY_MS
					);
					await sleep(delay);
				}
			}
		}

		logger.error("Service registration failed after max retries", {
			maxRetries: MAX_REGISTRATION_RETRIES,
		});
	}

	/**
	 * Starts periodic registration, token refresh, and TTL refresh cycles.
	 *
	 * - Registers the service with the discovery server (with retry)
	 * - Starts a scheduler with token and TTL refresh jobs
	 *
	 * @returns A handle with a `stop` method to gracefully shut down all cycles.
	 */
	start(): { stop: () => void } {
		void this._retryRegistration();

		const scheduler = new Scheduler();

		scheduler.register(
			new RefreshJob(
				this._tokenManager,
				(tm) => tm.refreshToken(),
				this._tokenRefreshIntervalMs
			)
		);

		scheduler.register(
			new RefreshJob(
				this._addressManagerClient,
				(client) => client.refreshTTL(),
				this._ttlRefreshIntervalMs
			)
		);

		scheduler.start();

		return {
			stop: () => {
				this._shouldRetryRegistration = false;
				scheduler.stop();
			},
		};
	}
}
