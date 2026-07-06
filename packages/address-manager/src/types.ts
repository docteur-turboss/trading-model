import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import type { CircuitBreaker } from "./discovery/circuit-breaker";
import type { IServiceCache } from "./discovery/service-cache.interface";

export interface AddressManagerDeps {
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
	circuitBreaker: CircuitBreaker;
}
