import type { AddressManagerConfig } from "./config/address-manager-config";
import { HeartbeatManager } from "./heartbeat-manager";
import {
	LifecycleManager,
	type LifecycleManagerOptions,
} from "./lifecycle-manager";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "./metrics";
import { RegistrationAttemptHandler } from "./registration-attempt-handler";
import { ShutdownHandler } from "./shutdown-handler";
import type {
	LifecycleDeps,
	ServiceClientDeps,
	ShutdownHandlerDeps,
} from "./types";

function _buildRegistrationManager(
	deps: ServiceClientDeps
): RegistrationAttemptHandler {
	return new RegistrationAttemptHandler({
		...deps,
		onSuccess: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () =>
			REGISTRATION_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

function _buildHeartbeatManager(deps: ServiceClientDeps): HeartbeatManager {
	return new HeartbeatManager({
		...deps,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

function createRegistrationAndHeartbeat(deps: ServiceClientDeps): {
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

	return new LifecycleManager(
		_buildLifecycleOptions(config, {
			...deps,
			shutdownHandler,
		})
	);
}

export function buildRegistrationAndHeartbeat(deps: ServiceClientDeps): {
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
} {
	return createRegistrationAndHeartbeat(deps);
}
