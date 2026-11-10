import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import type { ServiceCachePort } from "../domain/ports/service-cache.port";
import { MetricsCollector } from "../infrastructure/monitoring/metrics-collector";
import { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import { ServiceDiscovery } from "./discovery/service-discovery";
import {
	MappingServiceLocator,
	MapResolver,
} from "./discovery/service-locator";
export interface DiscoveryLayer {
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: ServiceHealthChecker;
	discoveryOrchestrator: DiscoveryOrchestrator;
	metricsCollector: MetricsCollector;
}
function buildCircuitBreaker(
	serviceCache: ServiceCachePort
): DiscoveryCircuitBreaker {
	return new DiscoveryCircuitBreaker({
		stateStore: serviceCache.circuitStateStore,
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
	serviceCache: ServiceCachePort;
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
	serviceCache: ServiceCachePort,
	config: AddressManagerConfig
): DiscoveryLayer {
	const circuitBreaker = buildCircuitBreaker(serviceCache);
	const healthChecker = buildHealthChecker(httpClient, config);
	const discoveryOrchestrator = buildDiscoveryOrchestrator({
		httpClient,
		serviceCache,
		config,
		circuitBreaker,
		healthChecker,
	});
	const metricsCollector = new MetricsCollector(circuitBreaker, serviceCache);
	return {
		circuitBreaker,
		healthChecker,
		discoveryOrchestrator,
		metricsCollector,
	};
}
