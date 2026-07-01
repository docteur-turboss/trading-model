import https from 'node:https';

import { Application } from 'express';
import promClient from 'prom-client';

import { HttpClient } from '@trading-model/common/config/http-client';
import { logger } from '@trading-model/common/config/logger';
import { AppError, ErrorCodes, normalizeError } from '@trading-model/common/utils/errors';
import { sleep } from '@trading-model/common/utils/sleep';

import { AddressManagerClient } from './client/address-manager-client';
import { TokenManager } from './client/token-manager';
import { ServiceInstance } from './client/type';
import { WebSocketClient, WsMessage } from './client/websocket-client';
import { AddressManagerConfig } from './config/address-manager-config';
import { CacheHealthRefresher } from './discovery/cache-health-refresher';
import { CircuitBreaker } from './discovery/circuit-breaker';
import { MapResolver } from './discovery/dns-resolver';
import { RedisServiceCache } from './discovery/redis-service-cache';
import { ServiceCache } from './discovery/service-cache';
import { IServiceCache } from './discovery/service-cache.interface';
import { ServiceDiscovery } from './discovery/service-discovery';
import { ServiceHealthChecker } from './discovery/service-health-checker';
import { MappingServiceLocator } from './discovery/service-locator';
import { metricsRoutes } from './http/routes/metrics.routes';
import { pingRoutes } from './http/routes/ping.routes';
import { ServiceCallTracker } from './monitoring/service-call-tracker';
import { SystemMetrics, type SystemMetricsPayload } from './monitoring/system-metrics';
import { RefreshJob } from './scheduler/refresh-job';
import { Scheduler } from './scheduler/scheduler';

const MAX_REGISTRATION_RETRIES = 10;
const REGISTRATION_BASE_DELAY_MS = 1000;
const REGISTRATION_MAX_DELAY_MS = 30_000;
const REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS = 30_000;

// Prometheus metrics
const discoveryCallsTotal = new promClient.Counter({
  name: 'address_manager_discovery_calls_total',
  help: 'Total number of service discovery calls',
  labelNames: ['service_name', 'result'] as const,
});

const discoveryDurationMs = new promClient.Histogram({
  name: 'address_manager_discovery_duration_ms',
  help: 'Duration of service discovery calls in ms',
  labelNames: ['service_name'] as const,
  buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 5000],
});

const registrationTotal = new promClient.Counter({
  name: 'address_manager_registration_total',
  help: 'Total number of service registration attempts',
  labelNames: ['result'] as const,
});

const heartbeatTotal = new promClient.Counter({
  name: 'address_manager_heartbeat_total',
  help: 'Total number of heartbeat attempts',
  labelNames: ['result'] as const,
});

const circuitBreakerState = new promClient.Gauge({
  name: 'address_manager_circuit_breaker_state',
  help: 'Circuit breaker state per instance (0=closed, 1=open, 2=half-open)',
  labelNames: ['instance_id'] as const,
});

const circuitBreakerInstancesTotal = new promClient.Gauge({
  name: 'address_manager_circuit_breaker_instances_total',
  help: 'Circuit breaker instance count by state',
  labelNames: ['state'] as const,
});

const cacheEntryCount = new promClient.Gauge({
  name: 'address_manager_cache_entries_total',
  help: 'Current number of cache entries by service',
  labelNames: [] as const,
});

export default class AddressManager {
  private readonly addressManagerClient: AddressManagerClient;
  private readonly healthChecker: ServiceHealthChecker;
  private readonly serviceDiscovery: ServiceDiscovery;
  private readonly tokenManager: TokenManager;
  private readonly serviceCache: IServiceCache;
  private readonly httpClient: HttpClient;
  private readonly tokenRefreshIntervalMs: number;
  private readonly ttlRefreshIntervalMs: number;
  private readonly cacheTtlMs: number;
  private readonly serviceName: string;
  private readonly instanceId: string;
  private readonly wsClient?: WebSocketClient;
  private readonly systemMetrics: SystemMetrics;
  private readonly serviceCallTracker: ServiceCallTracker;
  readonly circuitBreaker: CircuitBreaker;

  private shouldRetryRegistration = true;
  private resolveStopRegistration: (() => void) | null = null;
  private cleanupSignalHandlers?: () => void;
  private started = false;
  private consecutiveHeartbeatFailures = 0;
  private static readonly MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = 3;
  private readonly metricsIntervalMs: number;
  private metricsTimer?: NodeJS.Timeout;

  constructor(config: AddressManagerConfig) {
    this.httpClient = config.pems
      ? HttpClient.createWithTls({ RootCACertPath: config.pems.ca, CertificatePath: config.pems.cert, KeyCertificatePath: config.pems.key })
      : HttpClient.createWithTls({ RootCACertPath: config.RootCACertPath, CertificatePath: config.CertificatePath, KeyCertificatePath: config.KeyCertificatePath });

    this.tokenManager = new TokenManager(this.httpClient, config);
    this.addressManagerClient = new AddressManagerClient(
      this.httpClient,
      this.tokenManager,
      config
    );

    this.serviceCache = config.redisCacheUrl
      ? new RedisServiceCache(
          config.redisCacheUrl,
          'discovery:cache:',
          config.cacheTtlMs,
          config.redisCacheOptions
        )
      : new ServiceCache(
          config.cacheTtlMs,
          config.maxCacheTtlMs,
          config.discoveryCacheDir,
          undefined,
          config.maxCacheEntries
        );

    this.circuitBreaker = new CircuitBreaker(
      config.circuitBreakerFailureThreshold ?? 3,
      config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
      config.circuitBreakerCooldownMs ?? 30_000,
      this.serviceCache,
      config.circuitBreakerCacheTtlMs ?? 2_000,
      config.circuitBreakerLatencyWindowSize ?? 100,
      config.circuitBreakerLatencyThresholdMs ?? 5000
    );
    const healthCheckAgent = config.healthCheckTlsOptions
      ? new https.Agent({
          ca: config.healthCheckTlsOptions.ca,
          cert: config.healthCheckTlsOptions.cert,
          key: config.healthCheckTlsOptions.key,
          rejectUnauthorized: true,
        })
      : undefined;

    this.healthChecker = new ServiceHealthChecker(
      this.httpClient,
      config.servicePingTimeoutMs,
      config.dnsNameMap ? new MappingServiceLocator(new MapResolver(config.dnsNameMap)) : undefined,
      config.healthCheckWindowSize ?? 10,
      config.healthCheckPassThreshold ?? 0.7,
      config.healthCheckPath,
      healthCheckAgent,
      config.circuitBreakerLatencyWindowSize ?? 100,
      config.circuitBreakerLatencyThresholdMs ?? 5000,
      true
    );

    this.serviceDiscovery = new ServiceDiscovery(
      this.httpClient,
      this.serviceCache,
      config,
      this.healthChecker
    );

    if (config.wsUrl) {
      this.wsClient = new WebSocketClient(
        config.wsUrl,
        5000,
        config.wsSubscribedServices ?? ['*'],
        this.tokenManager.getTokenOrNull() ?? undefined,
        undefined,
        undefined,
        config.wsMaxQueueSize ?? 5000,
        config.wsMaxBufferedAmount ?? 262144
      );

      this.wsClient.onMessage((message: WsMessage) => {
        if (message.type === 'cache.invalidate') {
          const serviceName = message.payload?.serviceName as string | undefined;
          if (serviceName) {
            this.serviceCache.invalidate(serviceName).catch(err => {
              logger.warn('WebSocket cache invalidation failed', {
                serviceName,
                error: normalizeError(err),
              });
            });
          }
        }
      });

      this.wsClient.onAuthFailure(async () => {
        logger.warn('WebSocket auth failure — forcing re-registration');
        try {
          const res = await this.addressManagerClient.registerService();
          if (res?.token) {
            this.tokenManager.setToken(res.token);
            this.wsClient?.updateToken(res.token);
            registrationTotal.inc({ result: 'success' });
            logger.info('Re-registered after WS auth failure');
          }
        } catch (err) {
          logger.error('Re-registration after WS auth failure failed', {
            error: normalizeError(err),
          });
        }
      });
    }

    this.serviceName = config.serviceName;
    this.instanceId = config.instanceId;
    this.systemMetrics = new SystemMetrics();
    this.serviceCallTracker = new ServiceCallTracker(config.maxCallRecords ?? 1000);

    this.tokenRefreshIntervalMs = config.tokenRefreshIntervalMs;
    this.ttlRefreshIntervalMs = config.ttlRefreshIntervalMs;
    this.cacheTtlMs = config.cacheTtlMs;
    this.metricsIntervalMs = config.metricsIntervalMs ?? 15_000;
  }

  getToken(): string {
    return this.tokenManager.getToken();
  }

  private static readonly CIRCUIT_BREAKER_MAX_RETRIES = 2;
  private static readonly CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS = 100;

  async findService(serviceName: string): Promise<ServiceInstance> {
    let lastError: Error | null = null;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= AddressManager.CIRCUIT_BREAKER_MAX_RETRIES; attempt++) {
      try {
        const instance = await this.serviceDiscovery.findService(serviceName);
        // Non-blocking: load circuit breaker state in background.
        // If no local state yet, isOpen() returns false (assume closed).
        // This removes a synchronous Redis read from every discovery call.
        this.circuitBreaker.loadFromStore(instance.instanceId).catch(() => {});

        if (!this.circuitBreaker.isOpen(instance.instanceId)) {
          this.serviceDiscovery.acquireConnection(instance.instanceId);
          discoveryCallsTotal.inc({ service_name: serviceName, result: 'success' });
          discoveryDurationMs.observe({ service_name: serviceName }, Date.now() - startTime);
          return instance;
        }

        await this.serviceCache.invalidate(serviceName);

        if (attempt < AddressManager.CIRCUIT_BREAKER_MAX_RETRIES) {
          const delay = AddressManager.CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
        }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < AddressManager.CIRCUIT_BREAKER_MAX_RETRIES) {
          const delay = AddressManager.CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
          await sleep(delay);
        }
      }
    }

    // Last-known-good fallback: before giving up, try the service cache one more time
    // ignoring TTL — a stale instance is better than throwing SERVICE_UNREACHABLE
    try {
      const staleInstance = await this.serviceCache.get(serviceName);
      if (staleInstance) {
        logger.warn('Circuit breaker exhausted — returning stale cached instance as fallback', {
          serviceName,
          instanceId: staleInstance.instanceId,
        });
        discoveryCallsTotal.inc({ service_name: serviceName, result: 'degraded' });
        discoveryDurationMs.observe({ service_name: serviceName }, Date.now() - startTime);
        return staleInstance;
      }
    } catch {
      // ignore cache errors in fallback path
    }

    discoveryCallsTotal.inc({ service_name: serviceName, result: 'failure' });
    discoveryDurationMs.observe({ service_name: serviceName }, Date.now() - startTime);

    throw (
      lastError ??
      new AppError(
        `Service "${serviceName}" unreachable after ${AddressManager.CIRCUIT_BREAKER_MAX_RETRIES + 1} attempts`,
        ErrorCodes.SERVICE_UNREACHABLE
      )
    );
  }

  async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
    return this.serviceDiscovery.findAllServices(serviceName);
  }

  recordCallSuccess(instanceId: string, durationMs?: number): void {
    this.serviceDiscovery.releaseConnection(instanceId);
    this.circuitBreaker.recordSuccess(instanceId);
    circuitBreakerState.set({ instance_id: instanceId }, 0);
    if (durationMs !== undefined) {
      this.circuitBreaker.recordLatency(instanceId, durationMs);
      this.healthChecker.recordLatency(instanceId, durationMs, true);
    }
  }

  recordCallFailure(instanceId: string, durationMs?: number): void {
    this.serviceDiscovery.releaseConnection(instanceId);
    this.circuitBreaker.recordFailure(instanceId);
    circuitBreakerState.set(
      { instance_id: instanceId },
      this.circuitBreaker.isOpen(instanceId) ? 1 : 0
    );
    if (durationMs !== undefined) {
      this.circuitBreaker.recordLatency(instanceId, durationMs);
      this.healthChecker.recordLatency(instanceId, durationMs, false);
    }
  }

  listenExpress(app: Application): void {
    app.locals.metricsSnapshot = () => ({
      ...this.systemMetrics.collect(),
      callTracker: this.serviceCallTracker.snapshot(),
    });

    // Expose Prometheus metrics at /metrics
    app.get('/prometheus', async (_req, res) => {
      res.set('Content-Type', promClient.register.contentType);
      res.end(await promClient.register.metrics());
    });

    app.use(pingRoutes);
    app.use(metricsRoutes);
  }

  getMetrics(): SystemMetricsPayload {
    return this.systemMetrics.collect();
  }

  getServiceCallTracker(): ServiceCallTracker {
    return this.serviceCallTracker;
  }

  private async collectSaturationMetrics(): Promise<void> {
    const summary = this.circuitBreaker.getStateSummary();
    circuitBreakerInstancesTotal.set({ state: 'CLOSED' }, summary.CLOSED);
    circuitBreakerInstancesTotal.set({ state: 'OPEN' }, summary.OPEN);
    circuitBreakerInstancesTotal.set({ state: 'HALF_OPEN' }, summary.HALF_OPEN);

    const entries = await this.serviceCache.entries();
    cacheEntryCount.set(entries.length);
  }

  private async tryStickyRegistration(stopPromise: Promise<void>): Promise<void> {
    const existingToken = this.tokenManager.getTokenOrNull();
    if (existingToken) {
      logger.info('Sticky registration: found existing token, attempting heartbeat to validate');
      try {
        await this.addressManagerClient.refreshTTL();
        logger.info(
          'Sticky registration: heartbeat succeeded with existing token, registration valid'
        );
        return;
      } catch {
        logger.warn('Sticky registration: heartbeat with existing token failed, re-registering');
      }
    }
    return this.retryRegistration(stopPromise);
  }

  private async retryRegistration(stopPromise: Promise<void>): Promise<void> {
    for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
      if (!this.shouldRetryRegistration) return;

      try {
        const res = await this.addressManagerClient.registerService();
        if (!res?.token) {
          throw new Error('Registration response missing token');
        }
        registrationTotal.inc({ result: 'success' });
        this.tokenManager.setToken(res.token);
        this.wsClient?.updateToken(res.token);
        return;
      } catch (error) {
        registrationTotal.inc({ result: 'failure' });
        logger.error('Service registration failed', {
          attempt,
          maxRetries: MAX_REGISTRATION_RETRIES,
          error: normalizeError(error),
        });

        if (attempt < MAX_REGISTRATION_RETRIES) {
          const baseDelay = Math.min(
            REGISTRATION_BASE_DELAY_MS * Math.pow(2, attempt),
            REGISTRATION_MAX_DELAY_MS
          );
          const jitter = Math.random() * 1000;
          await Promise.race([sleep(baseDelay + jitter), stopPromise]);
          if (!this.shouldRetryRegistration) return;
        }
      }
    }

    logger.warn('Max registration retries exhausted — entering background retry mode');
    return this.backgroundRetryRegistration(stopPromise);
  }

  private async backgroundRetryRegistration(stopPromise: Promise<void>): Promise<void> {
    let backgroundAttempts = 0;

    while (this.shouldRetryRegistration) {
      backgroundAttempts++;

      try {
        const res = await this.addressManagerClient.registerService();
        if (!res?.token) {
          throw new Error('Registration response missing token');
        }
        this.tokenManager.setToken(res.token);
        this.wsClient?.updateToken(res.token);
        logger.info('Service re-registered successfully during background retry');
        return;
      } catch (error) {
        logger.error('Background registration retry failed', {
          error: normalizeError(error),
          attempt: backgroundAttempts,
        });
      }

      const jitteredInterval = REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS + Math.random() * 5000;
      await Promise.race([sleep(jitteredInterval), stopPromise]);

      await new Promise<void>(resolve => setImmediate(resolve));
    }

    throw new AppError(
      'Service registration failed — service stopped during background retry',
      ErrorCodes.ADDRESS_MANAGER_ERROR
    );
  }

  start(): { stop: () => Promise<void>; ready: Promise<void> } {
    if (this.started) {
      logger.warn('AddressManager already started — returning existing handle');
      return {
        ready: Promise.resolve(),
        stop: async () => {
          this.shouldRetryRegistration = false;
          this.resolveStopRegistration?.();
        },
      };
    }
    this.cleanupSignalHandlers?.();
    this.started = true;

    const stopPromise = new Promise<void>(resolve => {
      this.resolveStopRegistration = resolve;
    });

    const scheduler = new Scheduler();

    scheduler.register(
      new RefreshJob(this.tokenManager, tm => tm.refreshToken(), this.tokenRefreshIntervalMs)
    );

    scheduler.register(
      new RefreshJob(
        this.addressManagerClient,
        async _c => {
          await this.performHeartbeat();
        },
        this.ttlRefreshIntervalMs
      )
    );

    if (!(this.serviceCache instanceof RedisServiceCache)) {
      scheduler.register(
        new CacheHealthRefresher(this.serviceCache, this.healthChecker, this.cacheTtlMs / 2)
      );
    }

    this.metricsTimer = setInterval(() => {
      this.collectSaturationMetrics().catch(err => {
        logger.warn('Failed to collect saturation metrics', { error: normalizeError(err) });
      });
    }, this.metricsIntervalMs);

    const registrationPromise = this.tryStickyRegistration(stopPromise).then(() => {
      this.wsClient?.connect();
      scheduler.start();
    });

    const onSigTerm = async () => {
      logger.warn('SIGTERM received — shutting down AddressManager');
      this.shouldRetryRegistration = false;
      this.resolveStopRegistration?.();
      scheduler.stop();
      this.wsClient?.disconnect();
      try {
        await this.addressManagerClient.unregisterService();
      } catch (err) {
        logger.warn('Deregistration on SIGTERM failed', { error: normalizeError(err) });
      }
      await this.serviceCache.stop();
      this.circuitBreaker.clear();
      if (this.metricsTimer) {
        clearInterval(this.metricsTimer);
        this.metricsTimer = undefined;
      }
    };

    const onSigInt = async () => {
      logger.warn('SIGINT received — shutting down AddressManager');
      await onSigTerm();
    };

    process.on('SIGTERM', onSigTerm);
    process.on('SIGINT', onSigInt);

    this.cleanupSignalHandlers = () => {
      process.removeListener('SIGTERM', onSigTerm);
      process.removeListener('SIGINT', onSigInt);
    };

    return {
      ready: registrationPromise,
      stop: async () => {
        this.cleanupSignalHandlers?.();
        this.shouldRetryRegistration = false;
        this.resolveStopRegistration?.();
        scheduler.stop();
        this.wsClient?.disconnect();
        await this.unregister();
        await this.serviceCache.stop();
        this.circuitBreaker.clear();
        if (this.metricsTimer) {
          clearInterval(this.metricsTimer);
          this.metricsTimer = undefined;
        }
        this.started = false;
      },
    };
  }

  private async unregister(): Promise<void> {
    try {
      await this.addressManagerClient.unregisterService();
    } catch (error) {
      logger.warn('Failed to unregister service on stop', {
        error: normalizeError(error),
      });
    }
  }

  private async performHeartbeat(): Promise<void> {
    if (this.wsClient?.isConnected()) {
      const sent = this.wsClient.sendHeartbeat(this.serviceName, this.instanceId);
      if (sent) {
        heartbeatTotal.inc({ result: 'success' });
        this.consecutiveHeartbeatFailures = 0;
        return;
      }
    }

    try {
      await this.addressManagerClient.refreshTTL();
      heartbeatTotal.inc({ result: 'success' });
      this.consecutiveHeartbeatFailures = 0;
    } catch (err) {
      heartbeatTotal.inc({ result: 'failure' });
      this.consecutiveHeartbeatFailures++;
      logger.error('Heartbeat failed', {
        consecutiveFailures: this.consecutiveHeartbeatFailures,
        error: normalizeError(err),
      });

      if (
        this.consecutiveHeartbeatFailures >=
        AddressManager.MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER
      ) {
        logger.warn('Too many heartbeat failures — forcing re-registration');
        this.consecutiveHeartbeatFailures = 0;
        try {
          const res = await this.addressManagerClient.registerService();
          if (res?.token) {
            this.tokenManager.setToken(res.token);
            this.wsClient?.updateToken(res.token);
            heartbeatTotal.inc({ result: 'success' });
            return;
          }
        } catch (registerErr) {
          logger.error('Re-registration after heartbeat failures failed', {
            error: normalizeError(registerErr),
          });
        }
      }
    }

    if (this.addressManagerClient.hasIpChanged()) {
      logger.warn('Local IP changed, re-registering service');
      try {
        const res = await this.addressManagerClient.registerService();
        if (res) {
          registrationTotal.inc({ result: 'success' });
          this.tokenManager.setToken(res.token);
          this.wsClient?.updateToken(res.token);
        }
      } catch (err) {
        registrationTotal.inc({ result: 'failure' });
        logger.error('Re-registration after IP change failed', {
          error: normalizeError(err),
        });
      }
    }
  }
}
