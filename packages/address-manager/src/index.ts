import { Application } from 'express';

import { HttpClient } from '@trading-model/common/config/http-client';

import { AddressManagerClient } from './client/address-manager-client';
import { TokenManager } from './client/token-manager';
import { ServiceInstance } from './client/type';
import { AddressManagerConfig } from './config/address-manager-config';
import { ServiceCache } from './discovery/service-cache';
import { ServiceDiscovery } from './discovery/service-discovery';
import { ServiceHealthChecker } from './discovery/service-health-checker';
import { pingRoutes } from './http/routes/ping.routes';
import { RefreshJob } from './scheduler/refresh-job';
import { Scheduler } from './scheduler/scheduler';

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
  private readonly addressManagerClient: AddressManagerClient;
  private readonly healthChecker: ServiceHealthChecker;
  private readonly serviceDiscovery: ServiceDiscovery;
  private readonly tokenManager: TokenManager;
  private readonly serviceCache: ServiceCache;
  private readonly httpClient: HttpClient;
  private readonly tokenRefreshIntervalMs: number;
  private readonly ttlRefreshIntervalMs: number;

  constructor(config: AddressManagerConfig) {
    this.httpClient = new HttpClient({
      ca: config.RootCACertPath,
      cert: config.CertificatPath,
      key: config.KeyCertificatPath,
    });

    this.tokenManager = new TokenManager(this.httpClient, config);
    this.addressManagerClient = new AddressManagerClient(
      this.httpClient,
      this.tokenManager,
      config
    );

    this.serviceCache = new ServiceCache(config.cacheTtlMs);
    this.healthChecker = new ServiceHealthChecker(this.httpClient, config.servicePingTimeoutMs);

    this.serviceDiscovery = new ServiceDiscovery(
      this.httpClient,
      this.serviceCache,
      config,
      this.healthChecker
    );

    this.tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
    this.ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
  }

  /** Returns the current authentication token. */
  getToken(): string {
    return this.tokenManager.getToken();
  }

  /** Resolves a healthy service instance by name. */
  async findService(serviceName: string): Promise<ServiceInstance> {
    return this.serviceDiscovery.findService(serviceName);
  }

  /** Registers the ping health-check endpoint on the given Express app. */
  listenExpress(app: Application): void {
    app.use(pingRoutes);
  }

  /**
   * Starts periodic registration, token refresh, and TTL refresh cycles.
   *
   * - Registers the service with the discovery server
   * - Starts a scheduler with token and TTL refresh jobs
   *
   * @returns A handle with a `stop` method to gracefully shut down all cycles.
   */
  start(): { stop: () => void } {
    this.addressManagerClient.registerService().then(res => this.tokenManager.setToken(res.token));

    const scheduler = new Scheduler();

    scheduler.register(
      new RefreshJob(this.tokenManager, tm => tm.refreshToken(), this.tokenRefreshIntervalMs)
    );

    scheduler.register(
      new RefreshJob(this.addressManagerClient, c => c.refreshTTL(), this.ttlRefreshIntervalMs)
    );

    scheduler.start();

    return {
      stop: () => {
        scheduler.stop();
      },
    };
  }
}
