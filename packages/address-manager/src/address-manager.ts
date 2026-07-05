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
import { METRICS_ROUTES } from "./http/routes/metrics.routes";
import { PING_ROUTES } from "./http/routes/ping.routes";
import { ServiceCallTracker } from "./monitoring/service-call-tracker";
import {
	SystemMetrics,
	type SystemMetricsPayload,
} from "./monitoring/system-metrics";
import { RefreshJob } from "./scheduler/refresh-job";
import { Scheduler } from "./scheduler/scheduler";

const MAX_REGISTRATION_RETRIES = 10;
const REGISTRATION_BASE_DELAY_MS = 1000;
const REGISTRATION_MAX_DELAY_MS = 30_000;
const REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS = 30_000;

// Prometheus metrics
const DISCOVERY_CALLS_TOTAL = new promClient.Counter({
	name: "address_manager_discovery_calls_total",
	help: "Total number of service discovery calls",
	labelNames: ["serviceName", "result"] as const,
});

const DISCOVERY_DURATION_MS = new promClient.Histogram({
	name: "address_manager_discovery_duration_ms",
	help: "Duration of service discovery calls in ms",
	labelNames: ["serviceName"] as const,
	buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

const REGISTRATION_TOTAL = new promClient.Counter({
	name: "address_manager_registration_total",
	help: "Total number of service registration attempts",
	labelNames: ["result"] as const,
});

const HEARTBEAT_TOTAL = new promClient.Counter({
	name: "address_manager_heartbeat_total",
	help: "Total number of heartbeat attempts",
	labelNames: ["result"] as const,
});

const CIRCUIT_BREAKER_STATE = new promClient.Gauge({
	name: "address_manager_circuit_breaker_state",
	help: "Circuit breaker state per instance (0=closed, 1=open, 2=half-open)",
	labelNames: ["instanceId"] as const,
});

const CIRCUIT_BREAKER_INSTANCES_TOTAL = new promClient.Gauge({
	name: "address_manager_circuit_breaker_instances_total",
	help: "Circuit breaker instance count by state",
	labelNames: ["state"] as const,
});

const CACHE_ENTRY_COUNT = new promClient.Gauge({
	name: "address_manager_cache_entries_total",
	help: "Current number of cache entries by service",
	labelNames: [] as const,
});

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
	return new CircuitBreaker(
		config.circuitBreakerFailureThreshold ?? 3,
		config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
		serviceCache,
		config.circuitBreakerCacheTtlMs ?? 2_000,
		config.circuitBreakerLatencyWindowSize ?? 100,
		config.circuitBreakerLatencyThresholdMs ?? 5000
	);
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

	private _shouldRetryRegistration = true;
	private _resolveStopRegistration: (() => void) | null = null;
	private _cleanupSignalHandlers?: () => void;
	private _started = false;
	private _consecutiveHeartbeatFailures = 0;
	private static readonly _MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = 3;
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
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	private static readonly _CIRCUIT_BREAKER_MAX_RETRIES = 2;
	private static readonly _CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS = 100;

	async findService(serviceName: string): Promise<ServiceInstance> {
		let lastError: Error | null = null;
		const startTime = Date.now();

		for (
			let attempt = 0;
			attempt <= AddressManager._CIRCUIT_BREAKER_MAX_RETRIES;
			attempt++
		) {
			try {
				const instance = await this._serviceDiscovery.findService(serviceName);
				// Non-blocking: load circuit breaker state in background.
				// If no local state yet, isOpen() returns false (assume closed).
				// This removes a synchronous Redis read from every discovery call.
				this.circuitBreaker.loadFromStore(instance.instanceId).catch(() => {});

				if (!this.circuitBreaker.isOpen(instance.instanceId)) {
					this._serviceDiscovery.acquireConnection(instance.instanceId);
					DISCOVERY_CALLS_TOTAL.inc({
						serviceName: serviceName,
						result: "success",
					});
					DISCOVERY_DURATION_MS.observe(
						{
							serviceName: serviceName,
						},
						Date.now() - startTime
					);
					return instance;
				}

				await this._serviceCache.invalidate(serviceName);

				if (attempt < AddressManager._CIRCUIT_BREAKER_MAX_RETRIES) {
					const delay =
						AddressManager._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * 2 ** attempt;
					await sleep(delay);
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

		// Last-known-good fallback: before giving up, try the service cache one more time
		// ignoring TTL — a stale instance is better than throwing SERVICE_UNREACHABLE
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
				DISCOVERY_CALLS_TOTAL.inc({
					serviceName: serviceName,
					result: "degraded",
				});
				DISCOVERY_DURATION_MS.observe(
					{ serviceName: serviceName },
					Date.now() - startTime
				);
				return staleInstance;
			}
		} catch {
			// ignore cache errors in fallback path
		}

		DISCOVERY_CALLS_TOTAL.inc({
			serviceName: serviceName,
			result: "failure",
		});
		DISCOVERY_DURATION_MS.observe(
			{ serviceName: serviceName },
			Date.now() - startTime
		);

		throw (
			lastError ??
			new AppError(
				`Service "${serviceName}" unreachable after ${AddressManager._CIRCUIT_BREAKER_MAX_RETRIES + 1} attempts`,
				ErrorCodes.SERVICE_UNREACHABLE
			)
		);
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

	private async _tryStickyRegistration(
		stopPromise: Promise<void>
	): Promise<void> {
		const existingToken = this._tokenManager.getTokenOrNull();
		if (existingToken) {
			logger.info(
				"Sticky registration: found existing token, attempting heartbeat to validate"
			);
			try {
				await this._addressManagerClient.refreshTTL();
				logger.info(
					"Sticky registration: heartbeat succeeded with existing token, registration valid"
				);
				return;
			} catch {
				logger.warn(
					"Sticky registration: heartbeat with existing token failed, re-registering"
				);
			}
		}
		return this._retryRegistration(stopPromise);
	}

	private async _retryRegistration(stopPromise: Promise<void>): Promise<void> {
		for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
			if (!this._shouldRetryRegistration) {
				return;
			}

			try {
				const res = await this._addressManagerClient.registerService();
				if (!res?.token) {
					throw new Error("Registration response missing token");
				}
				REGISTRATION_TOTAL.inc({ result: "success" });
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
				return;
			} catch (error) {
				REGISTRATION_TOTAL.inc({ result: "failure" });
				logger.error("Service registration failed", {
					attempt,
					maxRetries: MAX_REGISTRATION_RETRIES,
					error: normalizeError(error),
				});

				if (attempt < MAX_REGISTRATION_RETRIES) {
					const baseDelay = Math.min(
						REGISTRATION_BASE_DELAY_MS * 2 ** attempt,
						REGISTRATION_MAX_DELAY_MS
					);
					const jitter = Math.random() * 1000;
					await Promise.race([sleep(baseDelay + jitter), stopPromise]);
					if (!this._shouldRetryRegistration) {
						return;
					}
				}
			}
		}

		logger.warn(
			"Max registration retries exhausted — entering background retry mode"
		);
		return this._backgroundRetryRegistration(stopPromise);
	}

	private async _backgroundRetryRegistration(
		stopPromise: Promise<void>
	): Promise<void> {
		let backgroundAttempts = 0;

		while (this._shouldRetryRegistration) {
			backgroundAttempts++;

			try {
				const res = await this._addressManagerClient.registerService();
				if (!res?.token) {
					throw new Error("Registration response missing token");
				}
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
				logger.info(
					"Service re-registered successfully during background retry"
				);
				return;
			} catch (error) {
				logger.error("Background registration retry failed", {
					error: normalizeError(error),
					attempt: backgroundAttempts,
				});
			}

			const jitteredInterval =
				REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS + Math.random() * 5000;
			await Promise.race([sleep(jitteredInterval), stopPromise]);

			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		throw new AppError(
			"Service registration failed — service stopped during background retry",
			ErrorCodes.ADDRESS_MANAGER_ERROR
		);
	}

	start(): { stop: () => void; ready: Promise<void> } {
		if (this._started) {
			logger.warn("AddressManager already started — returning existing handle");
			return {
				ready: Promise.resolve(),
				stop: () => {
					this._shouldRetryRegistration = false;
					this._resolveStopRegistration?.();
				},
			};
		}
		this._cleanupSignalHandlers?.();
		this._started = true;

		const stopPromise = new Promise<void>((resolve) => {
			this._resolveStopRegistration = resolve;
		});

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

		const registrationPromise = this._tryStickyRegistration(stopPromise).then(
			() => {
				if (!this._started) {
					return;
				}
				this._wsClient?.connect();
				scheduler.start();
			}
		);

		const onSigTerm = async () => {
			logger.warn("SIGTERM received — shutting down AddressManager");
			this._started = false;
			this._shouldRetryRegistration = false;
			this._resolveStopRegistration?.();
			scheduler.stop();
			this._wsClient?.disconnect();
			try {
				await this._addressManagerClient.unregisterService();
			} catch (err) {
				logger.warn("Deregistration on SIGTERM failed", {
					error: normalizeError(err),
				});
			}
			this._serviceCache.stop();
			this.circuitBreaker.clear();
			if (this._metricsTimer) {
				clearInterval(this._metricsTimer);
				this._metricsTimer = undefined;
			}
		};

		const onSigInt = async () => {
			logger.warn("SIGINT received — shutting down AddressManager");
			await onSigTerm();
		};

		process.on("SIGTERM", onSigTerm);
		process.on("SIGINT", onSigInt);

		this._cleanupSignalHandlers = () => {
			process.removeListener("SIGTERM", onSigTerm);
			process.removeListener("SIGINT", onSigInt);
		};

		return {
			ready: registrationPromise,
			stop: async () => {
				this._started = false;
				this._cleanupSignalHandlers?.();
				this._shouldRetryRegistration = false;
				this._resolveStopRegistration?.();
				scheduler.stop();
				this._wsClient?.disconnect();
				await this._unregister();
				this._serviceCache.stop();
				this.circuitBreaker.clear();
				if (this._metricsTimer) {
					clearInterval(this._metricsTimer);
					this._metricsTimer = undefined;
				}
			},
		};
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
		if (this._wsClient?.isConnected()) {
			const sent = this._wsClient.sendHeartbeat(
				this._serviceName,
				this._instanceId
			);
			if (sent) {
				HEARTBEAT_TOTAL.inc({ result: "success" });
				this._consecutiveHeartbeatFailures = 0;
				return;
			}
		}

		try {
			await this._addressManagerClient.refreshTTL();
			HEARTBEAT_TOTAL.inc({ result: "success" });
			this._consecutiveHeartbeatFailures = 0;
		} catch (err) {
			HEARTBEAT_TOTAL.inc({ result: "failure" });
			this._consecutiveHeartbeatFailures++;
			logger.error("Heartbeat failed", {
				consecutiveFailures: this._consecutiveHeartbeatFailures,
				error: normalizeError(err),
			});

			if (
				this._consecutiveHeartbeatFailures >=
				AddressManager._MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER
			) {
				logger.warn("Too many heartbeat failures — forcing re-registration");
				this._consecutiveHeartbeatFailures = 0;
				try {
					const res = await this._addressManagerClient.registerService();
					if (res?.token) {
						this._tokenManager.setToken(res.token);
						this._wsClient?.updateToken(res.token);
						HEARTBEAT_TOTAL.inc({ result: "success" });
						return;
					}
				} catch (registerErr) {
					logger.error("Re-registration after heartbeat failures failed", {
						error: normalizeError(registerErr),
					});
				}
			}
		}

		if (this._addressManagerClient.hasIpChanged()) {
			logger.warn("Local IP changed, re-registering service");
			try {
				const res = await this._addressManagerClient.registerService();
				if (res) {
					REGISTRATION_TOTAL.inc({ result: "success" });
					this._tokenManager.setToken(res.token);
					this._wsClient?.updateToken(res.token);
				}
			} catch (err) {
				REGISTRATION_TOTAL.inc({ result: "failure" });
				logger.error("Re-registration after IP change failed", {
					error: normalizeError(err),
				});
			}
		}
	}
}
