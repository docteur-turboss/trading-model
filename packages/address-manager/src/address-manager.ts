import { HttpClient } from "@trading-model/common/config/http-client";
import { logger } from "@trading-model/common/config/logger";
import {
	AppError,
	ErrorCodes,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { Application } from "express";
import promClient from "prom-client";

import { AddressManagerClient } from "./client/address-manager-client";
import { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import { WebSocketClient, type WsMessage } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { CacheHealthRefresher } from "./discovery/cache-health-refresher";
import { CircuitBreaker } from "./discovery/circuit-breaker";
import { MapResolver } from "./discovery/dns-resolver";
import { RedisServiceCache } from "./discovery/redis-service-cache";
import { ServiceCache } from "./discovery/service-cache";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { HeartbeatManager } from "./heartbeat-manager";
import { METRICS_ROUTES } from "./http/routes/metrics.routes";
import { PING_ROUTES } from "./http/routes/ping.routes";
import {
	CACHE_ENTRY_COUNT,
	CIRCUIT_BREAKER_INSTANCES_TOTAL,
	CIRCUIT_BREAKER_STATE,
	DISCOVERY_DURATION_MS,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
	recordDiscoveryMetrics,
} from "./metrics";
import { ServiceCallTracker } from "./monitoring/service-call-tracker";
import {
	SystemMetrics,
	type SystemMetricsPayload,
} from "./monitoring/system-metrics";
import { RegistrationManager } from "./registration-manager";
import { RefreshJob } from "./scheduler/refresh-job";
import { Scheduler } from "./scheduler/scheduler";
import { ShutdownHandler } from "./shutdown-handler";

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
		? new RedisServiceCache(
				config.redisCacheUrl,
				"discovery:cache:",
				config.cacheTtlMs,
				config.redisCacheOptions
			)
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

function createWsClient(
	config: AddressManagerConfig,
	addressManagerClient: AddressManagerClient,
	tokenManager: TokenManager,
	serviceCache: IServiceCache
): WebSocketClient {
	const wsClient = new WebSocketClient(
		config.wsUrl!,
		5000,
		config.wsSubscribedServices ?? ["*"],
		tokenManager.getTokenOrNull() ?? undefined,
		undefined,
		undefined,
		config.wsMaxQueueSize ?? 5000,
		config.wsMaxBufferedAmount ?? 262144
	);

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
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _serviceDiscovery: ServiceDiscovery;
	private readonly _tokenManager: TokenManager;
	private readonly _serviceCache: IServiceCache;
	private readonly _httpClient: HttpClient;
	private readonly _tokenRefreshIntervalMs: number;
	private readonly _ttlRefreshIntervalMs: number;
	private readonly _cacheTtlMs: number;
	private readonly _serviceName: string;
	private readonly _instanceId: string;
	private readonly _wsClient?: WebSocketClient;
	private readonly _systemMetrics: SystemMetrics;
	private readonly _serviceCallTracker: ServiceCallTracker;
	readonly circuitBreaker: CircuitBreaker;

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
		this.circuitBreaker = createCircuitBreaker(config, this._serviceCache);
		this._healthChecker = createHealthChecker(this._httpClient, config);
		this._serviceDiscovery = new ServiceDiscovery(
			this._httpClient,
			this._serviceCache,
			config,
			this._healthChecker
		);
		this._wsClient = config.wsUrl
			? createWsClient(
					config,
					this._addressManagerClient,
					this._tokenManager,
					this._serviceCache
				)
			: undefined;
		this._serviceName = config.serviceName;
		this._instanceId = config.instanceId;
		this._systemMetrics = new SystemMetrics();
		this._serviceCallTracker = new ServiceCallTracker(
			config.maxCallRecords ?? 1000
		);
		this._tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
		this._ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
		this._cacheTtlMs = config.cacheTtlMs;
		this._metricsIntervalMs = config.metricsIntervalMs ?? 15_000;

		this._registrationManager = new RegistrationManager(
			this._addressManagerClient,
			this._tokenManager,
			this._wsClient,
			() => REGISTRATION_TOTAL.inc({ result: "success" }),
			() => REGISTRATION_TOTAL.inc({ result: "failure" })
		);

		this._heartbeatManager = new HeartbeatManager(
			this._addressManagerClient,
			this._tokenManager,
			this._wsClient,
			() => HEARTBEAT_TOTAL.inc({ result: "success" }),
			() => HEARTBEAT_TOTAL.inc({ result: "failure" })
		);

		this._shutdownHandler = new ShutdownHandler(
			this._registrationManager,
			this._wsClient,
			this._addressManagerClient,
			this._serviceCache,
			this.circuitBreaker
		);
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	private static readonly _CIRCUIT_BREAKER_MAX_RETRIES = 2;
	private static readonly _CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS = 100;

	private async _attemptDiscovery(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance> {
		let lastError: Error | null = null;

		for (
			let attempt = 0;
			attempt <= AddressManager._CIRCUIT_BREAKER_MAX_RETRIES;
			attempt++
		) {
			try {
				const instance = await this._serviceDiscovery.findService(serviceName);
				const result = await this._checkServiceCircuitBreaker(
					instance,
					serviceName,
					startTime,
					attempt
				);
				if (result) {
					return result;
				}
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (attempt < AddressManager._CIRCUIT_BREAKER_MAX_RETRIES) {
					const delay =
						AddressManager._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * 2 ** attempt;
					await sleep(delay);
				}
			}
		}

		throw lastError ?? new Error("Discovery failed");
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		const startTime = Date.now();

		try {
			return await this._attemptDiscovery(serviceName, startTime);
		} catch (lastError) {
			const staleInstance = await this._fallbackToStaleCache(
				serviceName,
				startTime
			);
			if (staleInstance) {
				return staleInstance;
			}

			recordDiscoveryMetrics(serviceName, startTime, "failure");

			throw (
				lastError ??
				new AppError(
					`Service "${serviceName}" unreachable after ${AddressManager._CIRCUIT_BREAKER_MAX_RETRIES + 1} attempts`,
					ErrorCodes.SERVICE_UNREACHABLE
				)
			);
		}
	}

	private async _checkServiceCircuitBreaker(
		instance: ServiceInstance,
		serviceName: string,
		startTime: number,
		attempt: number
	): Promise<ServiceInstance | null> {
		this.circuitBreaker.loadFromStore(instance.instanceId).catch(() => {});

		if (!this.circuitBreaker.isOpen(instance.instanceId)) {
			this._serviceDiscovery.acquireConnection(instance.instanceId);
			recordDiscoveryMetrics(serviceName, startTime, "success");
			return instance;
		}

		await this._serviceCache.invalidate(serviceName);

		if (attempt < AddressManager._CIRCUIT_BREAKER_MAX_RETRIES) {
			const delay =
				AddressManager._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * 2 ** attempt;
			await sleep(delay);
		}

		return null;
	}

	private async _fallbackToStaleCache(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance | null> {
		try {
			const staleInstance = await this._serviceCache.get(serviceName);
			if (staleInstance) {
				logger.warn(
					"Circuit breaker exhausted — returning stale cached instance as fallback",
					{
						serviceName,
						instanceId: staleInstance.instanceId,
					}
				);
				recordDiscoveryMetrics(serviceName, startTime, "degraded");
				return staleInstance;
			}
		} catch {
			// ignore cache errors in fallback path
		}
		return null;
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
		return await this._serviceDiscovery.findAllServices(serviceName);
	}

	recordCallSuccess(instanceId: string, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordSuccess(instanceId);
		CIRCUIT_BREAKER_STATE.set(
			{
				instanceId: instanceId,
			},
			0
		);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, true);
		}
	}

	recordCallFailure(instanceId: string, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordFailure(instanceId);
		CIRCUIT_BREAKER_STATE.set(
			{
				instanceId: instanceId,
			},
			this.circuitBreaker.isOpen(instanceId) ? 1 : 0
		);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, false);
		}
	}

	listenExpress(app: Application): void {
		app.locals.metricsSnapshot = () => ({
			...this._systemMetrics.collect(),
			callTracker: this._serviceCallTracker.snapshot(),
		});

		// Expose Prometheus metrics at /metrics
		app.get("/prometheus", async (_req, res) => {
			res.set("Content-Type", promClient.register.contentType);
			res.end(await promClient.register.metrics());
		});

		app.use(PING_ROUTES);
		app.use(METRICS_ROUTES);
	}

	getMetrics(): SystemMetricsPayload {
		return this._systemMetrics.collect();
	}

	getServiceCallTracker(): ServiceCallTracker {
		return this._serviceCallTracker;
	}

	private async _collectSaturationMetrics(): Promise<void> {
		const summary = this.circuitBreaker.getStateSummary();
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set({ state: "closed" }, summary.closed);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set({ state: "open" }, summary.open);
		CIRCUIT_BREAKER_INSTANCES_TOTAL.set(
			{ state: "half-open" },
			summary["half-open"]
		);

		const entries = await this._serviceCache.entries();
		CACHE_ENTRY_COUNT.set(entries.length);
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
			this._collectSaturationMetrics().catch((err) => {
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
