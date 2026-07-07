import type { AddressManagerConfig } from "./config/address-manager-config";
import { HeartbeatManager } from "./heartbeat-manager";
import { type LifecycleManagerOptions, LifecycleManager } from "./lifecycle-manager";
import { HEARTBEAT_TOTAL, REGISTRATION_TOTAL } from "./metrics";
import { RegistrationAttemptHandler } from "./registration-attempt-handler";
import { ShutdownHandler } from "./shutdown-handler";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { AddressManagerDeps } from "./types";
import type { ShutdownHandlerDeps } from "./types";
import type { DiscoveryCircuitBreaker } from "./discovery/circuit-breaker";
import type { IServiceCache } from "./discovery/service-cache.interface";
import type { ServiceHealthChecker } from "./discovery/service-health-checker";
import type { WebSocketClient } from "./client/websocket-client";

export interface LifecycleDeps {
	circuitBreaker: DiscoveryCircuitBreaker;
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
	wsClient?: WebSocketClient;
	serviceCache: IServiceCache;
	tokenManager: TokenManager;
	addressManagerClient: AddressManagerClient;
	healthChecker: ServiceHealthChecker;
}

function _buildRegistrationManager(
	deps: AddressManagerDeps
): RegistrationAttemptHandler {
	return new RegistrationAttemptHandler({
		...deps,
		onSuccess: () => REGISTRATION_TOTAL.inc({ result: "success" }),
		onFailure: () => REGISTRATION_TOTAL.inc({ result: "failure" }),
	});
}

function _buildHeartbeatManager(deps: AddressManagerDeps): HeartbeatManager {
	return new HeartbeatManager({
		...deps,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: "success" }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: "failure" }),
	});
}

function createRegistrationAndHeartbeat(deps: AddressManagerDeps): {
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
} {
	return {
		registrationManager: _buildRegistrationManager(deps),
		heartbeatManager: _buildHeartbeatManager(deps),
	};
}

function _buildShutdownHandler(deps: ShutdownHandlerDeps): ShutdownHandler {
	return new ShutdownHandler(deps);
}

function _buildLifecycleOptions(
	config: AddressManagerConfig,
	deps: LifecycleDeps & { shutdownHandler: ShutdownHandler }
): LifecycleManagerOptions {
	return {
		registrationManager: deps.registrationManager,
		heartbeatManager: deps.heartbeatManager,
		shutdownHandler: deps.shutdownHandler,
		wsClient: deps.wsClient,
		serviceCache: deps.serviceCache,
		serviceName: config.identity.serviceName,
		instanceId: config.identity.instanceId,
		tokenRefreshIntervalMs: config.tokenRefreshIntervalMs,
		ttlRefreshIntervalMs: config.ttlRefreshIntervalMs,
		cacheTtlMs: config.cacheTtlMs,
		tokenManager: deps.tokenManager,
		addressManagerClient: deps.addressManagerClient,
		healthChecker: deps.healthChecker,
	};
}

export function createLifecycleManager(
	config: AddressManagerConfig,
	deps: LifecycleDeps
): LifecycleManager {
	const shutdownHandler = _buildShutdownHandler({
		registrationManager: deps.registrationManager,
		wsClient: deps.wsClient,
		addressManagerClient: deps.addressManagerClient,
		serviceCache: deps.serviceCache,
		circuitBreaker: deps.circuitBreaker,
	});

	return new LifecycleManager(_buildLifecycleOptions(config, {
		...deps, shutdownHandler,
	}));
}

export function buildRegistrationAndHeartbeat(
	deps: AddressManagerDeps
): {
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
} {
	return createRegistrationAndHeartbeat(deps);
}
