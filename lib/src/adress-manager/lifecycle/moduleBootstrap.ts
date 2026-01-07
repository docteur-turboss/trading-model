import { Application } from "express";

import { AddressManagerConfig } from "../config/AddressManagerConfig";

import { HttpClient } from "../utils/httpClient";
import { TokenManager } from "../client/tokenManager";
import { AddressManagerClient } from "../client/addressManagerClient";

import { ServiceCache } from "../discovery/serviceCache";
import { ServiceHealthChecker } from "../discovery/serviceHealthChecker";
import { ServiceDiscovery } from "../discovery/serviceDiscovery";

import { Scheduler } from "../scheduler/scheduler";
import { TtlRefresherJob } from "../scheduler/ttlRefresherJob";
import { TokenRefresherJob } from "../scheduler/tokenRefreshJob";

import { pingRoutes } from "../http/routes/ping.routes";

/**
 * Result exposed by the bootstrap function.
 * Only the APIs required by the rest of the application are visible.
 */
export interface AddressManagerModule {
  /**
   * Service discovery instance for resolving registered services.
   */
  serviceDiscovery: ServiceDiscovery;

  /**
   * Stops the module gracefully, including all scheduled jobs.
   */
  stop: () => Promise<void>;
}

/**
 * ModuleBootstrap
 *
 * Responsibilities:
 * - Instantiate all components of the Address Manager module
 * - Inject dependencies
 * - Mount Express HTTP routes
 * - Start scheduled cron jobs
 *
 * This is the ONLY place where all layers of the module are aware of each other.
 *
 * @param app - Express application instance
 * @param config - Module configuration
 * @returns Promise resolving to the public API of the module
 *
 * @example
 * ```ts
 * const moduleApi = await bootstrapAddressManagerModule(app, config);
 * // Use moduleApi.serviceDiscovery to resolve services
 * await moduleApi.stop(); // gracefully stops cron jobs
 * ```
 */
export async function bootstrapAddressManagerModule(
  app: Application,
  config: AddressManagerConfig
): Promise<AddressManagerModule> {
  /**
   * Utils
   */
  const httpClient = new HttpClient();

  /**
   * Auth / Token management
   */
  const tokenManager = new TokenManager(httpClient, config);
  await tokenManager.refreshToken();

  /**
   * Address Manager client
   */
  const addressManagerClient = new AddressManagerClient(
    httpClient,
    tokenManager,
    config
  );

  // Register this service in the Address Manager
  await addressManagerClient.registerService();

  /**
   * Service discovery components
   */
  const serviceCache = new ServiceCache(config.cacheTtlMs);
  const healthChecker = new ServiceHealthChecker(
    httpClient,
    config.servicePingTimeoutMs
  );

  const serviceDiscovery = new ServiceDiscovery(
    addressManagerClient,
    serviceCache,
    healthChecker
  );

  /**
   * HTTP routes
   */
  app.use(pingRoutes);

  /**
   * Scheduler / Cron jobs
   */
  const scheduler = new Scheduler();

  scheduler.register(
    new TokenRefresherJob(
      tokenManager,
      config.tokenRefreshIntervalMs
    )
  );

  scheduler.register(
    new TtlRefresherJob(
      addressManagerClient,
      config.ttlRefreshIntervalMs
    )
  );

  scheduler.start();

  /**
   * Public API exposed to the hosting service
   */
  return {
    serviceDiscovery,
    stop: async () => {
      scheduler.stop();
    },
  };
}