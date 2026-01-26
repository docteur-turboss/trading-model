import { ServiceHealthChecker } from "./discovery/serviceHealthChecker";
import { AddressManagerClient } from "./client/addressManagerClient";
import { AddressManagerConfig } from "./config/AddressManagerConfig";
import { TokenRefresherJob } from "./scheduler/tokenRefreshJob";
import { ServiceDiscovery } from "./discovery/serviceDiscovery";
import { TtlRefresherJob } from "./scheduler/ttlRefresherJob";
import { ServiceCache } from "./discovery/serviceCache";
import { pingRoutes } from "./http/routes/ping.routes";
import { TokenManager } from "./client/tokenManager";
import { Scheduler } from "./scheduler/scheduler";
import { ServiceInstance } from "./client/type";
import { HttpClient } from "utils/httpClient";
import { Application } from "express";

/**
 * Default export for the Address Manager library.
 *
 * This allows importing the library as:
 * ```ts
 * import adrManager from "cash-lib/adress-manager";
 * ```
 */
export default class {
  private AddressManagerClient: AddressManagerClient;
  private healthChecker : ServiceHealthChecker;
  private ServiceDiscovery: ServiceDiscovery;
  private tokenManager : TokenManager;
  private ServiceCache: ServiceCache;
  private HTTPCLIENT : HttpClient;

  public getToken: () => string;
  public start: () => {stop: () => void;};
  public findService: (serviceName: string) => Promise<ServiceInstance>
  public listenExpress: (app: Application) => void

  constructor(config: AddressManagerConfig) {
    this.HTTPCLIENT = new HttpClient({
      ca: config.RootCACertPath,
      cert: config.CertificatPath,
      key: config.KeyCertificatPath
    });

    this.tokenManager = new TokenManager(this.HTTPCLIENT, config);
    
    this.AddressManagerClient = new AddressManagerClient(
      this.HTTPCLIENT,
      this.tokenManager,
      config
    );

    this.ServiceCache = new ServiceCache(config.cacheTtlMs);
    this.healthChecker = new ServiceHealthChecker(
      this.HTTPCLIENT,
      config.servicePingTimeoutMs
    );
    
    this.ServiceDiscovery = new ServiceDiscovery(
      this.HTTPCLIENT,
      this.ServiceCache,
      config,
      this.healthChecker 
    );
    
    this.getToken = this.tokenManager.getToken;
    this.listenExpress = (app) => app.use(pingRoutes);
    this.findService = this.ServiceDiscovery.findService;
    this.start = () => {
      this.AddressManagerClient.registerService()
      .then(res => this.tokenManager.setToken(res.token));

      const scheduler = new Scheduler();

      scheduler.register(
        new TokenRefresherJob(
          this.tokenManager,
          config.tokenRefreshIntervalMs
        )
      );

      scheduler.register(
        new TtlRefresherJob(
          this.AddressManagerClient,
          config.ttlRefreshIntervalMs
        )
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
    }
  }
}