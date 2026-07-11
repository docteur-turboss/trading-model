import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { ServiceHealthChecker } from "./discovery/service-health-checker";
import type { HeartbeatManager } from "./heartbeat-manager";
import type { RegistrationManager } from "./registration-manager";

export interface RegistrationCallbacks {
	onSuccess?: () => void;
	onFailure?: () => void;
}

export interface AddressManagerDeps extends RegistrationCallbacks {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	wsClient?: WebSocketClient;
}

export interface ShutdownHandlerDeps {
	registrationManager: { shouldRetryRegistration: boolean };
	wsClient: WebSocketClient | undefined;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
	circuitBreaker: DiscoveryCircuitBreaker;
}

export interface HttpLayer {
	httpClient: import("@trading-model/common/config/http-client").HttpClient;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
}

export interface DiscoveryLayer {
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: import("./discovery/service-health-checker").ServiceHealthChecker;
	discoveryOrchestrator: import("./discovery/discovery-orchestrator").DiscoveryOrchestrator;
	metricsCollector: import("./monitoring/metrics-collector").MetricsCollector;
}

export interface ClientInfrastructure extends HttpLayer, DiscoveryLayer {
	wsClient: WebSocketClient | undefined;
}

export interface AddressManagerDependencies {
	tokenManager: TokenManager;
	discoveryOrchestrator: import("./discovery/discovery-orchestrator").DiscoveryOrchestrator;
	metricsCollector: import("./monitoring/metrics-collector").MetricsCollector;
	lifecycleManager: import("./lifecycle-manager").LifecycleManager;
}

export interface LifecycleManagerDeps {
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
	registrationManager: RegistrationManager;
	heartbeatManager: HeartbeatManager;
	wsClient: WebSocketClient | undefined;
	serviceCache: IServiceCache;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}
