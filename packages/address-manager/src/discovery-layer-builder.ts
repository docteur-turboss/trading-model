import type { HttpClient } from "@trading-model/common/config/http-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { MapResolver } from "./discovery/dns-resolver";
import type { IServiceCache } from "./discovery/service-cache.interface";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { ServiceHealthChecker } from "./discovery/service-health-checker";
import { MappingServiceLocator } from "./discovery/service-locator";
import { MetricsCollector } from "./monitoring/metrics-collector";

export interface DiscoveryLayer {
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: ServiceHealthChecker;
	discoveryOrchestrator: DiscoveryOrchestrator;
	metricsCollector: MetricsCollector;
}

export function buildDiscoveryLayer(
	httpClient: HttpClient,
	serviceCache: IServiceCache,
	config: AddressManagerConfig
): DiscoveryLayer {
	const circuitBreaker = new DiscoveryCircuitBreaker({
		failureThreshold: config.circuitBreakerFailureThreshold ?? 3,
		halfOpenTimeoutMs: config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
		stateStore: serviceCache,
		loadFromStoreCacheTtlMs: config.circuitBreakerCacheTtlMs ?? 2_000,
		latencyWindowSize: config.circuitBreakerLatencyWindowSize ?? 100,
		latencyP99ThresholdMs: config.circuitBreakerLatencyThresholdMs ?? 5000,
	});
	const healthChecker = new ServiceHealthChecker({
		httpClient,
		timeoutMs: config.servicePingTimeoutMs,
		serviceLocator: config.dnsNameMap
			? new MappingServiceLocator(new MapResolver(config.dnsNameMap))
			: undefined,
	});
	const discoveryOrchestrator = new DiscoveryOrchestrator({
		serviceDiscovery: new ServiceDiscovery({
			httpClient,
			serviceCache,
			config,
			healthChecker,
		}),
		serviceCache,
		circuitBreaker,
		healthChecker,
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
