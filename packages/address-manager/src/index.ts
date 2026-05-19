import { ServiceHealthChecker } from './discovery/service-health-checker';
import { AddressManagerClient } from './client/address-manager-client';
import { AddressManagerConfig } from './config/address-manager-config';
import { HttpClient } from '@trading-model/common/config/http-client';
import { TokenRefresherJob } from './scheduler/token-refresh-job';
import { ServiceDiscovery } from './discovery/service-discovery';
import { TtlRefresherJob } from './scheduler/ttl-refresher-job';
import { ServiceCache } from './discovery/service-cache';
import { pingRoutes } from './http/routes/ping.routes';
import { TokenManager } from './client/token-manager';
import { Scheduler } from './scheduler/scheduler';
import { ServiceInstance } from './client/type';
import { Application } from 'express';

/**
 * Default export for the Address Manager library.
 *
 * This allows importing the library as:
 * ```ts
 * import AddressManager from "@trading-model/address-manager";
 * ```
 */
export default class {
  private AddressManagerClient: AddressManagerClient;
  private healthChecker: ServiceHealthChecker;
  private ServiceDiscovery: ServiceDiscovery;
  private tokenManager: TokenManager;
  private ServiceCache: ServiceCache;
  private HTTPCLIENT: HttpClient;

  public getToken: () => string;
  public start: () => { stop: () => void };
  public findService: (serviceName: string) => Promise<ServiceInstance>;
  public listenExpress: (app: Application) => void;

  constructor(config: AddressManagerConfig) {
    this.HTTPCLIENT = new HttpClient({
      ca: config.RootCACertPath,
      cert: config.CertificatPath,
      key: config.KeyCertificatPath,
    });

    this.tokenManager = new TokenManager(this.HTTPCLIENT, config);

    this.AddressManagerClient = new AddressManagerClient(
      this.HTTPCLIENT,
      this.tokenManager,
      config
    );

    this.ServiceCache = new ServiceCache(config.cacheTtlMs);
    this.healthChecker = new ServiceHealthChecker(this.HTTPCLIENT, config.servicePingTimeoutMs);

    this.ServiceDiscovery = new ServiceDiscovery(
      this.HTTPCLIENT,
      this.ServiceCache,
      config,
      this.healthChecker
    );

    this.getToken = this.tokenManager.getToken;
    this.listenExpress = app => app.use(pingRoutes);
    this.findService = this.ServiceDiscovery.findService;
    this.start = () => {
      this.AddressManagerClient.registerService().then(res =>
        this.tokenManager.setToken(res.token)
      );

      const scheduler = new Scheduler();

      scheduler.register(new TokenRefresherJob(this.tokenManager, config.tokenRefreshIntervalMs));

      scheduler.register(
        new TtlRefresherJob(this.AddressManagerClient, config.ttlRefreshIntervalMs)
      );

      scheduler.start();

      /**
       * Public API exposed to the hosting service
       */
      return {
        stop: () => {
          scheduler.stop();
        },
      };
    };
  }
}
