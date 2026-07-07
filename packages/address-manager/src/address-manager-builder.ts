import { HttpClient } from "@trading-model/common/config/http-client";
import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";
import type { ICircuitStateStore } from "./discovery/circuit-state-store";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MapResolver } from "./discovery/service-locator";
import {
	buildRegistrationAndHeartbeat,
	createLifecycleManager,
} from "./lifecycle.factory";
import type { LifecycleManager } from "./lifecycle-manager";
import { MetricsCollector } from "./monitoring/metrics-collector";
import type {
	AddressManagerDependencies,
	ClientInfrastructure,
	DiscoveryLayer,
	HttpLayer,
} from "./types";
import { maybeCreateWsClient } from "./ws-client.factory";

export class AddressManagerBuilder {
	private _config!: AddressManagerConfig;

	withConfig(config: AddressManagerConfig): this {
		this._config = config;
		return this;
	}

	private _createHttpClient(): HttpClient {
		return HttpClient.createWithTls(this._config.pems ?? this._config.tls);
	}

	private _createServiceCache(): IServiceCache {
		return this._config.redisCacheUrl
			? new RedisServiceCache({
					redisUrl: this._config.redisCacheUrl,
					prefix: "discovery:cache:",
					ttlMs: this._config.cacheTtlMs,
					cacheOptions: this._config.redisCacheOptions,
				})
			: new ServiceCache(this._config.cacheTtlMs);
	}

	private _createCircuitBreaker(
		serviceCache: ICircuitStateStore
	): DiscoveryCircuitBreaker {
		return new DiscoveryCircuitBreaker({
			failureThreshold: this._config.circuitBreakerFailureThreshold ?? 3,
			halfOpenTimeoutMs: this._config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
			stateStore: serviceCache,
			loadFromStoreCacheTtlMs: this._config.circuitBreakerCacheTtlMs ?? 2_000,
			latencyWindowSize: this._config.circuitBreakerLatencyWindowSize ?? 100,
			latencyP99ThresholdMs:
				this._config.circuitBreakerLatencyThresholdMs ?? 5000,
		});
	}

	private _createHealthChecker(httpClient: HttpClient): ServiceHealthChecker {
		return new ServiceHealthChecker(
			httpClient,
			this._config.servicePingTimeoutMs,
			this._config.dnsNameMap
				? new MapResolver(this._config.dnsNameMap)
				: undefined
		);
	}

	private _createDiscoveryInfra(
		httpClient: HttpClient,
		serviceCache: IServiceCache,
		healthChecker: ServiceHealthChecker,
		circuitBreaker: DiscoveryCircuitBreaker
	): DiscoveryOrchestrator {
		const discovery = new ServiceDiscovery({
			httpClient,
			serviceCache,
			config: this._config,
			healthChecker,
		});
		return new DiscoveryOrchestrator({
			serviceDiscovery: discovery,
			serviceCache,
			circuitBreaker,
			healthChecker,
		});
	}

	private _buildHttpLayer(): HttpLayer {
		const httpClient = this._createHttpClient();
		const tokenManager = new TokenManager(httpClient, this._config);
		const addressManagerClient = new AddressManagerClient(
			httpClient,
			tokenManager,
			this._config
		);
		const serviceCache = this._createServiceCache();
		return { httpClient, tokenManager, addressManagerClient, serviceCache };
	}

	private _buildDiscoveryLayer(
		httpClient: HttpClient,
		serviceCache: IServiceCache
	): DiscoveryLayer {
		const circuitBreaker = this._createCircuitBreaker(
			serviceCache as unknown as ICircuitStateStore
		);
		const healthChecker = this._createHealthChecker(httpClient);
		const discoveryOrchestrator = this._createDiscoveryInfra(
			httpClient,
			serviceCache,
			healthChecker,
			circuitBreaker
		);
		const metricsCollector = new MetricsCollector(
			circuitBreaker,
			serviceCache,
			this._config.maxCallRecords
		);
		return {
			circuitBreaker,
			healthChecker,
			discoveryOrchestrator,
			metricsCollector,
		};
	}

	private _buildClientInfrastructure(): ClientInfrastructure {
		const http = this._buildHttpLayer();
		const discovery = this._buildDiscoveryLayer(
			http.httpClient,
			http.serviceCache
		);
		const wsClient = maybeCreateWsClient({
			config: this._config,
			addressManagerClient: http.addressManagerClient,
			tokenManager: http.tokenManager,
			serviceCache: http.serviceCache,
		});
		return { ...http, ...discovery, wsClient };
	}

	private _buildLifecycleManager(
		infra: ClientInfrastructure
	): LifecycleManager {
		const { registrationManager, heartbeatManager } =
			buildRegistrationAndHeartbeat({
				addressManagerClient: infra.addressManagerClient,
				tokenManager: infra.tokenManager,
				wsClient: infra.wsClient,
			});

		return createLifecycleManager(this._config, {
			circuitBreaker: infra.circuitBreaker,
			registrationManager,
			heartbeatManager,
			wsClient: infra.wsClient,
			serviceCache: infra.serviceCache,
			tokenManager: infra.tokenManager,
			addressManagerClient: infra.addressManagerClient,
			healthChecker: infra.healthChecker,
		});
	}

	build(): AddressManagerDependencies {
		const infra = this._buildClientInfrastructure();
		const lifecycleManager = this._buildLifecycleManager(infra);

		return {
			tokenManager: infra.tokenManager,
			discoveryOrchestrator: infra.discoveryOrchestrator,
			metricsCollector: infra.metricsCollector,
			lifecycleManager,
		};
	}
}
