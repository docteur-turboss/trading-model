import type { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import type { ServiceHealthChecker } from "../adapters/outbound/discovery/service-health-checker";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import type { ServiceCachePort } from "../domain/ports/service-cache.port";
import type { TokenManager } from "./client/token-manager";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import type { HeartbeatManager } from "./heartbeat-manager";
import type { RegistrationAttemptHandler } from "./registration-attempt-handler";

/** Dependencies of the service client. */
export interface ServiceClientDeps {
	addressManagerClient: AddressManagerClient;
	tokenManager: TokenManager;
	onSuccess?: () => void;
	onFailure?: () => void;
}

/** Dependencies of ShutdownHandler. */
export interface ShutdownHandlerDeps {
	registrationManager: { stopRetrying: () => void };
	addressManagerClient: AddressManagerClient;
	serviceCache: ServiceCachePort;
	circuitBreaker: DiscoveryCircuitBreaker;
}

/** Dependencies of the lifecycle builder. */
export interface LifecycleDeps {
	config: AddressManagerConfig;
	circuitBreaker: DiscoveryCircuitBreaker;
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
	serviceCache: ServiceCachePort;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}
