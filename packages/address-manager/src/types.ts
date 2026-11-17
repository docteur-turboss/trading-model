import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";

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
}
