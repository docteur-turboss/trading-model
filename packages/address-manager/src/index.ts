import { Application } from 'express';

import { HttpClient } from '@trading-model/common/config/http-client';
import { logger } from '@trading-model/common/config/logger';
import { sleep } from '@trading-model/common/utils/sleep';

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
  private readonly addressManagerClient: AddressManagerClient;
  private readonly healthChecker: ServiceHealthChecker;
  private readonly serviceDiscovery: ServiceDiscovery;
  private readonly tokenManager: TokenManager;
  private readonly serviceCache: ServiceCache;
  private readonly httpClient: HttpClient;
  private readonly tokenRefreshIntervalMs: number;
  private readonly ttlRefreshIntervalMs: number;
  private shouldRetryRegistration = true;

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
    this.healthChecker = new ServiceHealthChecker(
      this.httpClient,
      config.servicePingTimeoutMs,
      config.dnsNameMap
    );

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
   * Register the service with exponential backoff retry.
   *
   * Attempts to register until success, max retries are exhausted,
   * or `stop()` is called. Each failure is logged with attempt count.
   */
  private async retryRegistration(): Promise<void> {
    for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
      if (!this.shouldRetryRegistration) return;

      try {
        const res = await this.addressManagerClient.registerService();
        this.tokenManager.setToken(res.token);
        return;
      } catch (error) {
        logger.error('Service registration failed', {
          attempt,
          maxRetries: MAX_REGISTRATION_RETRIES,
          error,
        });

        if (attempt < MAX_REGISTRATION_RETRIES) {
          const delay = Math.min(
            REGISTRATION_BASE_DELAY_MS * Math.pow(2, attempt),
            REGISTRATION_MAX_DELAY_MS
          );
          await sleep(delay);
        }
      }
    }

    logger.error('Service registration failed after max retries', {
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
    this.retryRegistration();

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
        this.shouldRetryRegistration = false;
        scheduler.stop();
      },
    };
  }
}
