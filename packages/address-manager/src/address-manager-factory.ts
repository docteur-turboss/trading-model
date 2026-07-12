import { HttpClient } from "@trading-model/common/config/http-client";
import { URLString } from "@trading-model/common/domain/primitives";
import { CacheInvalidationHandler } from "./cache-invalidation-handler";
import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { MapResolver } from "./discovery/dns-resolver";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { HeartbeatManager } from "./heartbeat-manager";
import {
	LifecycleManager,
	type LifecycleManagerOptions,
} from "./lifecycle-manager";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "./metrics";
import { MetricsCollector } from "./monitoring/metrics-collector";
import { RegistrationManager } from "./registration-manager";
import { ShutdownHandler } from "./shutdown-handler";
import type {
	LifecycleDeps,
	ServiceClientDeps,
	ShutdownHandlerDeps,
} from "./types";
import { WsAuthFailureHandler } from "./ws-auth-failure-handler";

interface AddressManagerDependencies {
	tokenManager: TokenManager;
	discoveryOrchestrator: DiscoveryOrchestrator;
	metricsCollector: MetricsCollector;
	lifecycleManager: LifecycleManager;
}

import type { WsClientContext } from "./ws-client.factory";

function createHttpClient(config: AddressManagerConfig): HttpClient {
	return HttpClient.createWithTls(config.pems ?? config.tls);
}

function createServiceCache(config: AddressManagerConfig): IServiceCache {
	return config.redisCacheUrl
		? new RedisServiceCache({
				redisUrl: config.redisCacheUrl,
				prefix: "discovery:cache:",
				ttlMs: config.cacheTtlMs,
				cacheOptions: config.redisCacheOptions,
			})
		: new ServiceCache(config.cacheTtlMs);
}

function createCircuitBreaker(
	config: AddressManagerConfig,
	serviceCache: IServiceCache
): DiscoveryCircuitBreaker {
	return new DiscoveryCircuitBreaker({
		failureThreshold: config.circuitBreakerFailureThreshold ?? 3,
		halfOpenTimeoutMs: config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
		stateStore: serviceCache,
		loadFromStoreCacheTtlMs: config.circuitBreakerCacheTtlMs ?? 2_000,
		latencyWindowSize: config.circuitBreakerLatencyWindowSize ?? 100,
		latencyP99ThresholdMs: config.circuitBreakerLatencyThresholdMs ?? 5000,
	});
}

function createHealthChecker(
	httpClient: HttpClient,
	config: AddressManagerConfig
): ServiceHealthChecker {
	return new ServiceHealthChecker({
		httpClient,
		timeoutMs: config.servicePingTimeoutMs,
		serviceLocator: config.dnsNameMap
			? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
			: undefined,
	});
}

interface DiscoveryInfraDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	healthChecker: ServiceHealthChecker;
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
}

function createDiscoveryInfra(deps: DiscoveryInfraDeps): DiscoveryOrchestrator {
	const discovery = new ServiceDiscovery({
		httpClient: deps.httpClient,
		serviceCache: deps.serviceCache,
		config: deps.config,
		healthChecker: deps.healthChecker,
	});
	return new DiscoveryOrchestrator({
		serviceDiscovery: discovery,
		serviceCache: deps.serviceCache,
		circuitBreaker: deps.circuitBreaker,
		healthChecker: deps.healthChecker,
	});
}

function _buildRegistrationManager(
	deps: ServiceClientDeps
): RegistrationManager {
	return new RegistrationManager({
		...deps,
		onSuccess: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

function _buildHeartbeatManager(deps: ServiceClientDeps): HeartbeatManager {
	return new HeartbeatManager({
		...deps,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

function createRegistrationAndHeartbeat(deps: ServiceClientDeps): {
	registrationManager: RegistrationManager;
	heartbeatManager: HeartbeatManager;
} {
	return {
		registrationManager: _buildRegistrationManager(deps),
		heartbeatManager: _buildHeartbeatManager(deps),
	};
}

function createWsClient(ctx: WsClientContext): WebSocketClient {
	const { config, addressManagerClient, tokenManager, serviceCache } = ctx;
	const cacheInvalidationHandler = new CacheInvalidationHandler();
	const wsAuthFailureHandler = new WsAuthFailureHandler();
	const deps = { addressManagerClient, tokenManager };
	let wsClient: WebSocketClient;

	wsClient = new WebSocketClient({
		url: URLString.of(config.wsUrl!),
		subscribedServices: config.wsSubscribedServices ?? ["*"],
		token: tokenManager.getTokenOrUndefined(),
		onMessage: (message) => {
			cacheInvalidationHandler.handle(message, serviceCache);
		},
		onAuthFailure: () => {
			wsAuthFailureHandler.handle({ ...deps, wsClient });
		},
	});

	return wsClient;
}

function maybeCreateWsClient(
	config: AddressManagerConfig,
	addressManagerClient: AddressManagerClient,
	tokenManager: TokenManager,
	serviceCache: IServiceCache
): WebSocketClient | undefined {
	if (!config.wsUrl) {
		return;
	}
	return createWsClient({
		config,
		addressManagerClient,
		tokenManager,
		serviceCache,
	});
}

function createLifecycleManager(deps: LifecycleDeps): LifecycleManager {
	const shutdownHandler = _buildShutdownHandler({
		registrationManager: deps.registrationManager,
		wsClient: deps.wsClient,
		addressManagerClient: deps.addressManagerClient,
		serviceCache: deps.serviceCache,
		circuitBreaker: deps.circuitBreaker,
	});

	return new LifecycleManager(
		_buildLifecycleOptions(deps.config, {
			registrationManager: deps.registrationManager,
			heartbeatManager: deps.heartbeatManager,
			shutdownHandler,
			wsClient: deps.wsClient,
			serviceCache: deps.serviceCache,
			tokenManager: deps.tokenManager,
			addressManagerClient: deps.addressManagerClient,
			healthChecker: deps.healthChecker,
		})
	);
}

function _buildShutdownHandler(deps: ShutdownHandlerDeps): ShutdownHandler {
	return new ShutdownHandler(deps);
}

function _buildLifecycleOptions(
	config: AddressManagerConfig,
	deps: {
		registrationManager: RegistrationManager;
		heartbeatManager: HeartbeatManager;
		shutdownHandler: ShutdownHandler;
		wsClient?: WebSocketClient;
		serviceCache: IServiceCache;
		tokenManager: TokenManager;
		addressManagerClient: AddressManagerClient;
		healthChecker: ServiceHealthChecker;
	}
): LifecycleManagerOptions {
	return {
		registrationManager: deps.registrationManager,
		heartbeatManager: deps.heartbeatManager,
		shutdownHandler: deps.shutdownHandler,
		wsClient: deps.wsClient,
		serviceCache: deps.serviceCache,
		serviceName: config.identity.serviceName,
		instanceId: config.identity.instanceId,
		tokenRefreshIntervalMs: config.tokenRefreshIntervalMs,
		ttlRefreshIntervalMs: config.ttlRefreshIntervalMs,
		cacheTtlMs: config.cacheTtlMs,
		tokenManager: deps.tokenManager,
		addressManagerClient: deps.addressManagerClient,
		healthChecker: deps.healthChecker,
	};
}

function _buildHttpLayer(config: AddressManagerConfig) {
	const httpClient = createHttpClient(config);
	const tokenManager = new TokenManager(httpClient, config);
	const addressManagerClient = new AddressManagerClient(
		httpClient,
		tokenManager,
		config
	);
	const serviceCache = createServiceCache(config);
	return { httpClient, tokenManager, addressManagerClient, serviceCache };
}

function _buildDiscoveryLayer(
	httpClient: HttpClient,
	serviceCache: IServiceCache,
	config: AddressManagerConfig
) {
	const circuitBreaker = createCircuitBreaker(config, serviceCache);
	const healthChecker = createHealthChecker(httpClient, config);
	const discoveryOrchestrator = createDiscoveryInfra({
		httpClient,
		serviceCache,
		healthChecker,
		config,
		circuitBreaker,
	});
	const metricsCollector = new MetricsCollector(
		circuitBreaker,
		serviceCache,
		config.maxCallRecords
	);
	return {
		circuitBreaker,
		healthChecker,
		discoveryOrchestrator,
		metricsCollector,
	};
}

function _buildClientInfrastructure(config: AddressManagerConfig) {
	const http = _buildHttpLayer(config);
	const discovery = _buildDiscoveryLayer(
		http.httpClient,
		http.serviceCache,
		config
	);
	const wsClient = maybeCreateWsClient(
		config,
		http.addressManagerClient,
		http.tokenManager,
		http.serviceCache
	);
	return { ...http, ...discovery, wsClient };
}

function _buildLifecycleManager(
	config: AddressManagerConfig,
	infra: ReturnType<typeof _buildClientInfrastructure>
): LifecycleManager {
	const { registrationManager, heartbeatManager } =
		_createRegistrationAndHeartbeat(infra);

	return createLifecycleManager({
		config,
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

function _createRegistrationAndHeartbeat(
	infra: ReturnType<typeof _buildClientInfrastructure>
): {
	registrationManager: RegistrationManager;
	heartbeatManager: HeartbeatManager;
} {
	const baseDeps: AddressManagerDeps = {
		addressManagerClient: infra.addressManagerClient,
		tokenManager: infra.tokenManager,
		wsClient: infra.wsClient,
	};
	return createRegistrationAndHeartbeat(baseDeps);
}

export function buildAddressManagerDependencies(
	config: AddressManagerConfig
): AddressManagerDependencies {
	const infra = _buildClientInfrastructure(config);
	const lifecycleManager = _buildLifecycleManager(config, infra);

	return {
		tokenManager: infra.tokenManager,
		discoveryOrchestrator: infra.discoveryOrchestrator,
		metricsCollector: infra.metricsCollector,
		lifecycleManager,
	};
}
