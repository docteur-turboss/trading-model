import { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import { ServiceCache } from "../adapters/outbound/discovery/service-cache";
import { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import { TokenManager } from "../application/client/token-manager";
import { DiscoveryCircuitBreaker } from "../application/discovery/circuit-breaker";
import { DiscoveryRetryHandler } from "../application/discovery/discovery-retry-handler";
import {
	MappingServiceLocator,
	MapResolver,
} from "../application/discovery/service-locator";
import { HeartbeatManager } from "../application/heartbeat-manager";
import { LifecycleManager } from "../application/lifecycle-manager";
import { RegistrationAttemptHandler } from "../application/registration-attempt-handler";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "../infrastructure/metrics";
import { MetricsCollector } from "../infrastructure/monitoring/metrics-collector";
import { ShutdownHandler } from "../infrastructure/shutdown-handler";

/** Wires every address-manager dependency from the config. */
export function buildAddressManagerDependencies(config: AddressManagerConfig) {
	const httpClient = HttpClient.createWithTls(config.tls);
	const tokenManager = new TokenManager(httpClient, config);
	const addressManagerClient = new AddressManagerClient(
		httpClient,
		tokenManager,
		config
	);
	const serviceCache = new ServiceCache(config.cacheTtlMs);
	const circuitBreaker = new DiscoveryCircuitBreaker();
	const healthChecker = new ServiceHealthChecker({
		httpClient,
		timeoutMs: config.servicePingTimeoutMs,
		serviceLocator: config.dnsNameMap
			? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
			: undefined,
	});
	const discovery = new DiscoveryRetryHandler(
		{ httpClient, serviceCache, config, healthChecker },
		circuitBreaker
	);
	const registrationManager = new RegistrationAttemptHandler({
		addressManagerClient,
		tokenManager,
		onSuccess: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
	const heartbeatManager = new HeartbeatManager({
		addressManagerClient,
		tokenManager,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
	const lifecycleManager = new LifecycleManager({
		registrationManager,
		heartbeatManager,
		shutdownHandler: new ShutdownHandler({
			registrationManager,
			addressManagerClient,
			serviceCache,
			circuitBreaker,
		}),
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
	return {
		tokenManager,
		discovery,
		metricsCollector: new MetricsCollector(circuitBreaker, serviceCache),
		lifecycleManager,
	};
}
