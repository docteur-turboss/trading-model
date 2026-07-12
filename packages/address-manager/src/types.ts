import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { ServiceHealthChecker } from "./discovery/service-health-checker";
import type { HeartbeatManager } from "./heartbeat-manager";
import type { RegistrationAttemptHandler } from "./registration-attempt-handler";
import type { RegistrationManager } from "./registration-manager";

export interface ServiceClientDeps {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	wsClient?: WebSocketClient;
	onSuccess?: () => void;
	onFailure?: () => void;
}

export interface ShutdownHandlerDeps {
	registrationManager: { shouldRetryRegistration: boolean };
	wsClient: WebSocketClient | undefined;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
	circuitBreaker: DiscoveryCircuitBreaker;
}

export interface LifecycleDeps {
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
	registrationManager: RegistrationManager | RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
	wsClient?: WebSocketClient;
	serviceCache: IServiceCache;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}
