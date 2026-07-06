import { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { Application } from "express";

import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import { WebSocketClient, type WsMessage } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { CircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { MapResolver } from "./discovery/dns-resolver";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { HeartbeatManager } from "./heartbeat-manager";
import { LifecycleManager } from "./lifecycle-manager";
import { HEARTBEAT_TOTAL, REGISTRATION_TOTAL } from "./metrics";
import { MetricsCollector } from "./monitoring/metrics-collector";
import { RegistrationManager } from "./registration-manager";
import { ShutdownHandler } from "./shutdown-handler";

// ---------------------------------------------------------------------------
// Exported context type for WS client creation
// ---------------------------------------------------------------------------
export interface WsClientContext {
	config: AddressManagerConfig;
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	serviceCache: IServiceCache;
}

// ---------------------------------------------------------------------------
// Module-level factory functions
// ---------------------------------------------------------------------------

function createHttpClient(config: AddressManagerConfig): HttpClient {
	return HttpClient.createWithTls(config.pems ?? config.tls)
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
	serviceCache: IServiceCache,
): CircuitBreaker {
	return new CircuitBreaker({
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
	config: AddressManagerConfig,
): ServiceHealthChecker {
	return new ServiceHealthChecker(
		httpClient,
		config.servicePingTimeoutMs,
		config.dnsNameMap
			? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
			: undefined,
	);
}

function createDiscoveryInfra(
	httpClient: HttpClient,
	serviceCache: IServiceCache,
	healthChecker: ServiceHealthChecker,
	config: AddressManagerConfig,
	circuitBreaker: CircuitBreaker,
): DiscoveryOrchestrator {
	const discovery = new ServiceDiscovery({
		httpClient,
		serviceCache,
		config,
		healthChecker,
	});
	return new DiscoveryOrchestrator({
		serviceDiscovery: discovery,
		serviceCache,
		circuitBreaker,
		healthChecker,
	});
}

function createRegistrationAndHeartbeat(
	addressManagerClient: AddressManagerClient,
	tokenManager: TokenManager,
	wsClient: WebSocketClient | undefined,
): { registrationManager: RegistrationManager; heartbeatManager: HeartbeatManager } {
	const registrationManager = new RegistrationManager({
		addressManagerClient,
		tokenManager,
		wsClient,
		onSuccess: () => REGISTRATION_TOTAL.inc({ result: "success" }),
		onFailure: () => REGISTRATION_TOTAL.inc({ result: "failure" }),
	});
	const heartbeatManager = new HeartbeatManager({
		addressManagerClient,
		tokenManager,
		wsClient,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: "success" }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: "failure" }),
	});
	return { registrationManager, heartbeatManager };
}

function onCacheInvalidateMessage(
	message: WsMessage,
	serviceCache: IServiceCache,
): void {
	if (message.type !== "cache.invalidate") {
		return;
	}
	const serviceName = message.payload?.serviceName as string | undefined;
	if (!serviceName) {
		return;
	}
	serviceCache.invalidate(serviceName).catch((err) => {
		logger.warn("WebSocket cache invalidation failed", {
			serviceName,
			error: normalizeError(err),
		});
	});
}

function onWsAuthFailure(
	addressManagerClient: AddressManagerClient,
	tokenManager: TokenManager,
	wsClient: WebSocketClient,
): void {
	logger.warn("WebSocket auth failure \u2014 forcing re-registration");
	addressManagerClient
		.registerService()
		.then((res) => {
			if (res?.token) {
				tokenManager.setToken(res.token);
				wsClient.updateToken(res.token);
				REGISTRATION_TOTAL.inc({ result: "success" });
				logger.info("Re-registered after WS auth failure");
			}
		})
		.catch((err) => {
			logger.error("Re-registration after WS auth failure failed", {
				error: normalizeError(err),
			});
		});
}

function createWsClient(ctx: WsClientContext): WebSocketClient {
	const { config, addressManagerClient, tokenManager, serviceCache } = ctx;
	const wsClient = new WebSocketClient({
		url: config.wsUrl!,
		subscribedServices: config.wsSubscribedServices ?? ["*"],
		token: tokenManager.getTokenOrNull() ?? undefined,
	});

	wsClient.onMessage((message: WsMessage) => {
		onCacheInvalidateMessage(message, serviceCache);
	});

	wsClient.onAuthFailure(() => {
		onWsAuthFailure(addressManagerClient, tokenManager, wsClient);
	});

	return wsClient;
}

function maybeCreateWsClient(
	config: AddressManagerConfig,
	addressManagerClient: AddressManagerClient,
	tokenManager: TokenManager,
	serviceCache: IServiceCache,
): WebSocketClient | undefined {
	if (!config.wsUrl) {
		return undefined;
	}
	return createWsClient({ config, addressManagerClient, tokenManager, serviceCache });
}

function createLifecycleManager(
	config: AddressManagerConfig,
	circuitBreaker: CircuitBreaker,
	registrationManager: RegistrationManager,
	heartbeatManager: HeartbeatManager,
	wsClient: WebSocketClient | undefined,
	serviceCache: IServiceCache,
	tokenManager: TokenManager,
	addressManagerClient: AddressManagerClient,
	healthChecker: ServiceHealthChecker,
): LifecycleManager {
	const shutdownHandler = new ShutdownHandler(
		registrationManager,
		wsClient,
		addressManagerClient,
		serviceCache,
		circuitBreaker,
	);

	return new LifecycleManager({
		registrationManager,
		heartbeatManager,
		shutdownHandler,
		wsClient,
		serviceCache,
		serviceName: config.identity.serviceName,
		instanceId: config.identity.instanceId,
		tokenRefreshIntervalMs: config.tokenRefreshIntervalMs,
		ttlRefreshIntervalMs: config.ttlRefreshIntervalMs,
		cacheTtlMs: config.cacheTtlMs,
		tokenManager,
		addressManagerClient,
		healthChecker,
	});
}

// ---------------------------------------------------------------------------
// AddressManager \u2014 thin orchestrator
// ---------------------------------------------------------------------------
export default class AddressManager {
	private readonly _httpClient: HttpClient;
	private readonly _tokenManager: TokenManager;
	private readonly _addressManagerClient: AddressManagerClient;
	private readonly _serviceCache: IServiceCache;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _discoveryOrchestrator: DiscoveryOrchestrator;
	private readonly _metricsCollector: MetricsCollector;
	private readonly _wsClient?: WebSocketClient;
	private readonly _lifecycleManager: LifecycleManager;

	constructor(config: AddressManagerConfig) {
		this._httpClient = createHttpClient(config);
		this._tokenManager = new TokenManager(this._httpClient, config);
		this._addressManagerClient = new AddressManagerClient(
			this._httpClient,
			this._tokenManager,
			config,
		);
		this._serviceCache = createServiceCache(config);

		const circuitBreaker = createCircuitBreaker(config, this._serviceCache);
		this._healthChecker = createHealthChecker(this._httpClient, config);
		this._discoveryOrchestrator = createDiscoveryInfra(
			this._httpClient,
			this._serviceCache,
			this._healthChecker,
			config,
			circuitBreaker,
		);
		this._metricsCollector = new MetricsCollector(
			circuitBreaker,
			this._serviceCache,
			config.maxCallRecords,
		);
		this._wsClient = maybeCreateWsClient(
			config,
			this._addressManagerClient,
			this._tokenManager,
			this._serviceCache,
		);

		const { registrationManager, heartbeatManager } = createRegistrationAndHeartbeat(
			this._addressManagerClient,
			this._tokenManager,
			this._wsClient,
		);

		this._lifecycleManager = createLifecycleManager(
			config,
			circuitBreaker,
			registrationManager,
			heartbeatManager,
			this._wsClient,
			this._serviceCache,
			this._tokenManager,
			this._addressManagerClient,
			this._healthChecker,
		);
	}

	get circuitBreaker(): CircuitBreaker {
		return this._discoveryOrchestrator.circuitBreaker;
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		return this._discoveryOrchestrator.findService(serviceName);
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
		return this._discoveryOrchestrator.findAllServices(serviceName);
	}

	recordCallSuccess(instanceId: string, durationMs?: number): void {
		this._discoveryOrchestrator.recordCallSuccess(instanceId, durationMs);
	}

	recordCallFailure(instanceId: string, durationMs?: number): void {
		this._discoveryOrchestrator.recordCallFailure(instanceId, durationMs);
	}

	listenExpress(app: Application): void {
		this._metricsCollector.listenExpress(app);
	}

	getMetrics(): import("./monitoring/system-metrics").SystemMetricsPayload {
		return this._metricsCollector.getMetrics();
	}

	getServiceCallTracker(): import("./monitoring/service-call-tracker").ServiceCallTracker {
		return this._metricsCollector.getServiceCallTracker();
	}

	start(): { stop: () => void; ready: Promise<void> } {
		return this._lifecycleManager.start();
	}
}