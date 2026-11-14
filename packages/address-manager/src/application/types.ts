import type { AddressManagerClient } from "../adapters/outbound/client/address-manager-client";
import type { ServiceCachePort } from "../domain/ports/service-cache.port";
import type { TokenManager } from "./client/token-manager";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";

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
