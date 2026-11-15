import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import type { ServiceCachePort } from "./ports/service-cache.port";

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
