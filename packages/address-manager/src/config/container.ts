import { HttpClient } from "@trading-model/http/http-client";
import { AddressManagerClient } from "../client/address-manager-client";
import { TokenManager } from "../client/token-manager";
import { DiscoveryCircuitBreaker } from "../discovery/circuit-breaker";
import { DiscoveryRetryHandler } from "../discovery/discovery-retry-handler";
import { ServiceCache } from "../discovery/service-cache";
import { ServiceHealthChecker } from "../discovery/service-health-checker";
import {
	MappingServiceLocator,
	MapResolver,
} from "../discovery/service-locator";
import { HeartbeatManager } from "../heartbeat-manager";
import { LifecycleManager } from "../lifecycle-manager";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "../metrics";
import { MetricsCollector } from "../monitoring/metrics-collector";
import { RegistrationAttemptHandler } from "../registration-attempt-handler";
import { ShutdownHandler } from "../shutdown-handler";
import type { AddressManagerConfig } from "./address-manager-config";

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
