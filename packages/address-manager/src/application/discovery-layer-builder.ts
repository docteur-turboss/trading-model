import type { HttpClient } from "@trading-model/common/config/http-client";
import { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import { MapResolver } from "../domain/discovery/dns-resolver";
import type { IServiceCache } from "../domain/discovery/service-cache.interface";
import { MetricsCollector } from "../infrastructure/monitoring/metrics-collector";
import { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { ServiceDiscovery } from "./discovery/service-discovery";
import { MappingServiceLocator } from "./discovery/service-locator";
export interface DiscoveryLayer {
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: ServiceHealthChecker;
	discoveryOrchestrator: DiscoveryOrchestrator;
	metricsCollector: MetricsCollector;
}
function buildCircuitBreaker(
	config: AddressManagerConfig,
	serviceCache: IServiceCache
): DiscoveryCircuitBreaker {
	return new DiscoveryCircuitBreaker({
		failureThreshold: config.circuitBreakerFailureThreshold ?? 3,
		halfOpenTimeoutMs: config.circuitBreakerHalfOpenTimeoutMs ?? 10_000,
		stateStore: serviceCache.circuitStateStore,
		loadFromStoreCacheTtlMs: config.circuitBreakerCacheTtlMs ?? 2_000,
		latencyWindowSize: config.circuitBreakerLatencyWindowSize ?? 100,
		latencyP99ThresholdMs: config.circuitBreakerLatencyThresholdMs ?? 5000,
	});
}
function buildHealthChecker(
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
interface BuildDiscoveryOrchestratorDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: ServiceHealthChecker;
}
function buildDiscoveryOrchestrator(
	deps: BuildDiscoveryOrchestratorDeps
): DiscoveryOrchestrator {
	const { httpClient, serviceCache, config, circuitBreaker, healthChecker } =
		deps;
	return new DiscoveryOrchestrator({
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
}
export function buildDiscoveryLayer(
	httpClient: HttpClient,
	serviceCache: IServiceCache,
	config: AddressManagerConfig
): DiscoveryLayer {
	const circuitBreaker = buildCircuitBreaker(config, serviceCache);
	const healthChecker = buildHealthChecker(httpClient, config);
	const discoveryOrchestrator = buildDiscoveryOrchestrator({
		httpClient,
		serviceCache,
		config,
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
