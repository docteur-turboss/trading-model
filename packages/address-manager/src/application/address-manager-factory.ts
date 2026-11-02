import {
	buildHttpLayer,
	type HttpLayer,
} from "../adapters/outbound/http-layer-builder";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import type { DiscoveryLayer } from "./discovery-layer-builder";
import { buildDiscoveryLayer } from "./discovery-layer-builder";
import type { HeartbeatManager } from "./heartbeat-manager";
import { buildLifecycleManager } from "./lifecycle-builder";
import type { LifecycleManager } from "./lifecycle-manager";
import type { RegistrationAttemptHandler } from "./registration-attempt-handler";
import { buildRegistrationAndHeartbeat } from "./registration-heartbeat-builder";

interface AddressManagerDependencies {
	tokenManager: import("./client/token-manager").TokenManager;
	discoveryOrchestrator: import("./discovery/discovery-orchestrator").DiscoveryOrchestrator;
	metricsCollector: import("../infrastructure/monitoring/metrics-collector").MetricsCollector;
	lifecycleManager: LifecycleManager;
}
interface BuildLifecycleDeps {
	config: AddressManagerConfig;
	http: HttpLayer;
	discovery: DiscoveryLayer;
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
}
function buildLifecycle(deps: BuildLifecycleDeps): LifecycleManager {
	const { config, http, discovery, registrationManager, heartbeatManager } =
		deps;
	return buildLifecycleManager({
		config,
		circuitBreaker: discovery.circuitBreaker,
		registrationManager,
		heartbeatManager,
		serviceCache: http.serviceCache,
		tokenManager: http.tokenManager,
		addressManagerClient: http.addressManagerClient,
		healthChecker: discovery.healthChecker,
	});
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
	const { registrationManager, heartbeatManager } =
		buildRegistrationAndHeartbeat({
			addressManagerClient: http.addressManagerClient,
			tokenManager: http.tokenManager,
		});
	const lifecycleManager = buildLifecycle({
		config,
		http,
		discovery,
		registrationManager,
		heartbeatManager,
	});
	return {
		tokenManager: http.tokenManager,
		discoveryOrchestrator: discovery.discoveryOrchestrator,
		metricsCollector: discovery.metricsCollector,
		lifecycleManager,
	};
}
