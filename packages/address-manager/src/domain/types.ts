import type { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import type { WebSocketClient } from "../adapters/outbound/client/websocket-client";
import type { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import type { TokenManager } from "../application/client/token-manager";
import type { DiscoveryCircuitBreaker } from "../application/discovery/circuit-breaker";
import type { HeartbeatManager } from "../application/heartbeat-manager";
import type { RegistrationAttemptHandler } from "../application/registration-attempt-handler";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { IServiceCache } from "./discovery/service-cache.interface";

export interface ServiceClientDeps {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	wsClient?: WebSocketClient;
	onSuccess?: () => void;
	onFailure?: () => void;
}

export interface ShutdownHandlerDeps {
	registrationManager: { stopRetrying: () => void };
	wsClient: WebSocketClient | undefined;
	addressManagerClient: AddressManagerClient;
	serviceCache: IServiceCache;
	circuitBreaker: DiscoveryCircuitBreaker;
}

export interface LifecycleDeps {
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
	wsClient?: WebSocketClient;
	serviceCache: IServiceCache;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}
