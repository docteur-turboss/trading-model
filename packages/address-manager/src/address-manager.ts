import { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { Application } from "express";

import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import { WebSocketClient, type WsMessage } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { CacheHealthRefresher } from "./discovery/cache-health-refresher";
import { CircuitBreaker } from "./discovery/circuit-breaker";
import { MapResolver } from "./discovery/dns-resolver";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { HeartbeatManager } from "./heartbeat-manager";
import { HEARTBEAT_TOTAL, REGISTRATION_TOTAL } from "./metrics";
import { MetricsCollector } from "./monitoring/metrics-collector";
import { RegistrationManager } from "./registration-manager";
import { RefreshJob } from "./scheduler/refresh-job";
import { Scheduler } from "./scheduler/scheduler";
import { ShutdownHandler } from "./shutdown-handler";

export interface WsClientContext {
	config: AddressManagerConfig;
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	serviceCache: IServiceCache;
}

function createHttpClient(config: AddressManagerConfig): HttpClient {
	return config.pems
		? HttpClient.createWithTls({
				rootCACertPath: config.pems.ca,
				certificatePath: config.pems.cert,
				keyCertificatePath: config.pems.key,
			})
		: HttpClient.createWithTls({
				rootCACertPath: config.rootCACertPath,
				certificatePath: config.certificatePath,
				keyCertificatePath: config.keyCertificatePath,
			});
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
	config: AddressManagerConfig
): ServiceHealthChecker {
	return new ServiceHealthChecker(
		httpClient,
		config.servicePingTimeoutMs,
		config.dnsNameMap
			? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
			: undefined
	);
}

function createWsClient(ctx: WsClientContext): WebSocketClient {
	const { config, addressManagerClient, tokenManager, serviceCache } = ctx;
	const wsClient = new WebSocketClient({
		url: config.wsUrl!,
		subscribedServices: config.wsSubscribedServices ?? ["*"],
		token: tokenManager.getTokenOrNull() ?? undefined,
	});

	wsClient.onMessage((message: WsMessage) => {
		if (message.type === "cache.invalidate") {
			const serviceName = message.payload?.serviceName as string | undefined;
			if (serviceName) {
				serviceCache.invalidate(serviceName).catch((err) => {
					logger.warn("WebSocket cache invalidation failed", {
						serviceName,
						error: normalizeError(err),
					});
				});
			}
		}
	});

	wsClient.onAuthFailure(() => {
		logger.warn("WebSocket auth failure — forcing re-registration");
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
	});

	return wsClient;
}

export default class AddressManager {
	private readonly _addressManagerClient: AddressManagerClient;
	private readonly _tokenManager: TokenManager;
	private readonly _discoveryOrchestrator: DiscoveryOrchestrator;
	private readonly _metricsCollector: MetricsCollector;
	private readonly _discovery: ServiceDiscovery;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _serviceCache: IServiceCache;
	private readonly _httpClient: HttpClient;
	private readonly _tokenRefreshIntervalMs: number;
	private readonly _ttlRefreshIntervalMs: number;
	private readonly _cacheTtlMs: number;
	private readonly _serviceName: string;
	private readonly _instanceId: string;
	private readonly _wsClient?: WebSocketClient;

	private _registrationManager: RegistrationManager;
	private _heartbeatManager: HeartbeatManager;
	private _shutdownHandler: ShutdownHandler;
	private _started = false;
	private readonly _metricsIntervalMs: number;
	private _metricsTimer?: NodeJS.Timeout;

	constructor(config: AddressManagerConfig) {
		this._httpClient = createHttpClient(config);
		this._tokenManager = new TokenManager(this._httpClient, config);
		this._addressManagerClient = new AddressManagerClient(
			this._httpClient,
			this._tokenManager,
			config
		);
		this._serviceCache = createServiceCache(config);
		const circuitBreaker = createCircuitBreaker(config, this._serviceCache);
		this._healthChecker = createHealthChecker(this._httpClient, config);
		this._discovery = new ServiceDiscovery({
			httpClient: this._httpClient,
			serviceCache: this._serviceCache,
			config,
			healthChecker: this._healthChecker,
		});
		this._discoveryOrchestrator = new DiscoveryOrchestrator(
			this._discovery,
			this._serviceCache,
			circuitBreaker,
			this._healthChecker
		);
		this._metricsCollector = new MetricsCollector(
			circuitBreaker,
			this._serviceCache,
			config.maxCallRecords
		);
		this._wsClient = config.wsUrl
			? createWsClient({
					config,
					addressManagerClient: this._addressManagerClient,
					tokenManager: this._tokenManager,
					serviceCache: this._serviceCache,
				})
			: undefined;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
		this._ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
		this._cacheTtlMs = config.cacheTtlMs;
		this._metricsIntervalMs = config.metricsIntervalMs ?? 15_000;

		this._registrationManager = new RegistrationManager({
			addressManagerClient: this._addressManagerClient,
			tokenManager: this._tokenManager,
			wsClient: this._wsClient,
			onSuccess: () => REGISTRATION_TOTAL.inc({ result: "success" }),
			onFailure: () => REGISTRATION_TOTAL.inc({ result: "failure" }),
		});

		this._heartbeatManager = new HeartbeatManager({
			addressManagerClient: this._addressManagerClient,
			tokenManager: this._tokenManager,
			wsClient: this._wsClient,
			onSuccess: () => HEARTBEAT_TOTAL.inc({ result: "success" }),
			onFailure: () => HEARTBEAT_TOTAL.inc({ result: "failure" }),
		});

		this._shutdownHandler = new ShutdownHandler(
			this._registrationManager,
			this._wsClient,
			this._addressManagerClient,
			this._serviceCache,
			circuitBreaker
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

	private async _register(): Promise<void> {
		await this._registrationManager.tryStickyRegistration();
	}

	start(): { stop: () => void; ready: Promise<void> } {
		if (this._started) {
			logger.warn("AddressManager already started — returning existing handle");
			return {
				ready: Promise.resolve(),
				stop: () => {
					this._shutdownHandler.shutdown();
				},
			};
		}
		this._shutdownHandler.removeSignalHandlers();
		this._started = true;

		const scheduler = new Scheduler();

		this._setupSchedulers(scheduler);

		const registrationPromise = this._register().then(
			() => {
				if (!this._started) {
					return;
				}
				this._wsClient?.connect();
				scheduler.start();
			}
		);

		this._shutdownHandler.setupSignalHandlers(scheduler);

		return {
			ready: registrationPromise,
			stop: async () => {
				this._started = false;
				this._shutdownHandler.removeSignalHandlers();
				scheduler.stop();
				await this._shutdownHandler.fullStop();
			},
		};
	}

	private _setupSchedulers(scheduler: Scheduler): void {
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
				async (_c) => {
					await this._performHeartbeat();
				},
				this._ttlRefreshIntervalMs
			)
		);

		if (!(this._serviceCache instanceof RedisServiceCache)) {
			scheduler.register(
				new CacheHealthRefresher(
					this._serviceCache,
					this._healthChecker,
					this._cacheTtlMs / 2
				)
			);
		}

		this._metricsTimer = setInterval(() => {
			this._metricsCollector.collectSaturationMetrics().catch((err) => {
				logger.warn("Failed to collect saturation metrics", {
					error: normalizeError(err),
				});
			});
		}, this._metricsIntervalMs);
		this._shutdownHandler.setMetricsTimer(this._metricsTimer);
	}

	private async _unregister(): Promise<void> {
		try {
			await this._addressManagerClient.unregisterService();
		} catch (error) {
			logger.warn("Failed to unregister service on stop", {
				error: normalizeError(error),
			});
		}
	}

	private async _performHeartbeat(): Promise<void> {
		await this._heartbeatManager.performHeartbeat(
			this._serviceName,
			this._instanceId
		);
	}
}
