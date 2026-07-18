import type { AddressManagerConfig } from "./config/address-manager-config";
import { buildDiscoveryLayer } from "./discovery-layer-builder";
import { buildHttpLayer } from "./http-layer-builder";
import { buildLifecycleManager } from "./lifecycle-builder";
import { buildRegistrationAndHeartbeat } from "./registration-heartbeat-builder";
import { maybeCreateWsClient } from "./ws-client.factory";

interface AddressManagerDependencies {
	tokenManager: import("./client/token-manager").TokenManager;
	discoveryOrchestrator: import("./discovery/discovery-orchestrator").DiscoveryOrchestrator;
	metricsCollector: import("./monitoring/metrics-collector").MetricsCollector;
	lifecycleManager: import("./lifecycle-manager").LifecycleManager;
}

export function buildAddressManagerDependencies(
	config: AddressManagerConfig
): AddressManagerDependencies {
	const http = buildHttpLayer(config);
	const discovery = buildDiscoveryLayer(
		http.httpClient,
		http.serviceCache,
		config
	);
	const wsClient = maybeCreateWsClient({
		config,
		addressManagerClient: http.addressManagerClient,
		tokenManager: http.tokenManager,
		serviceCache: http.serviceCache,
	});

	const { registrationManager, heartbeatManager } =
		buildRegistrationAndHeartbeat({
			addressManagerClient: http.addressManagerClient,
			tokenManager: http.tokenManager,
			wsClient,
		});

	const lifecycleManager = buildLifecycleManager({
		config,
		circuitBreaker: discovery.circuitBreaker,
		registrationManager,
		heartbeatManager,
		wsClient,
		serviceCache: http.serviceCache,
		tokenManager: http.tokenManager,
		addressManagerClient: http.addressManagerClient,
		healthChecker: discovery.healthChecker,
	});

	return {
		tokenManager: http.tokenManager,
		discoveryOrchestrator: discovery.discoveryOrchestrator,
		metricsCollector: discovery.metricsCollector,
		lifecycleManager,
	};
}
