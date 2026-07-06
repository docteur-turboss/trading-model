import { HttpClient } from "@trading-model/common/config/http-client";
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
import { RegistrationManager } from "./registration-manager";

export default class AddressManager {
	private readonly _addressManagerClient: AddressManagerClient;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _serviceDiscovery: ServiceDiscovery;
	private readonly _tokenManager: TokenManager;
	private readonly _serviceCache: ServiceCache;
	private readonly _httpClient: HttpClient;
	private readonly _tokenRefreshIntervalMs: number;
	private readonly _ttlRefreshIntervalMs: number;
	private readonly _registrationManager: RegistrationManager;

	constructor(config: AddressManagerConfig) {
		this._httpClient = HttpClient.createWithTls(config.tls);
		this._tokenManager = new TokenManager(this._httpClient, config);
		this._addressManagerClient = new AddressManagerClient(
			this._httpClient,
			this._tokenManager,
			config,
		);
		this._serviceCache = new ServiceCache(config.cacheTtlMs);
		this._healthChecker = this._createHealthChecker(config);
		this._serviceDiscovery = this._createServiceDiscovery(config);
		this._tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
		this._ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
		this._registrationManager = new RegistrationManager(
			this._addressManagerClient,
			this._tokenManager,
		);
	}

	private _createHealthChecker(config: AddressManagerConfig): ServiceHealthChecker {
		return new ServiceHealthChecker(
			this._httpClient,
			config.servicePingTimeoutMs,
			config.dnsNameMap
				? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
				: undefined,
		);
	}

	private _createServiceDiscovery(config: AddressManagerConfig): ServiceDiscovery {
		return new ServiceDiscovery({
			httpClient: this._httpClient,
			serviceCache: this._serviceCache,
			config,
			healthChecker: this._healthChecker,
		});
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		return await this._serviceDiscovery.findService(serviceName);
	}

	listenExpress(app: Application): void {
		app.use(PING_ROUTES);
	}

	start(): { stop: () => void } {
		const regHandle = this._registrationManager.start();

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
				regHandle.stop();
				scheduler.stop();
			},
		};
	}
}
