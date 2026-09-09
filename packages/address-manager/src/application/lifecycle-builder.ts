import type { LifecycleDeps, ShutdownHandlerDeps } from "../domain/types";
import { ShutdownHandler } from "../infrastructure/shutdown-handler";
import {
	LifecycleManager,
	type LifecycleManagerOptions,
} from "./lifecycle-manager";

function buildShutdownHandler(deps: ShutdownHandlerDeps): ShutdownHandler {
	return new ShutdownHandler(deps);
}

function buildLifecycleOptions(
	config: LifecycleDeps["config"],
	deps: {
		registrationManager: LifecycleDeps["registrationManager"];
		heartbeatManager: LifecycleDeps["heartbeatManager"];
		shutdownHandler: ShutdownHandler;
		wsClient: LifecycleDeps["wsClient"];
		serviceCache: LifecycleDeps["serviceCache"];
		tokenManager: LifecycleDeps["tokenManager"];
		addressManagerClient: LifecycleDeps["addressManagerClient"];
		healthChecker: LifecycleDeps["healthChecker"];
	}
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

export function buildLifecycleManager(deps: LifecycleDeps): LifecycleManager {
	const shutdownHandler = buildShutdownHandler({
		registrationManager: deps.registrationManager,
		wsClient: deps.wsClient,
		addressManagerClient: deps.addressManagerClient,
		serviceCache: deps.serviceCache,
		circuitBreaker: deps.circuitBreaker,
	});

	return new LifecycleManager(
		buildLifecycleOptions(deps.config, {
			registrationManager: deps.registrationManager,
			heartbeatManager: deps.heartbeatManager,
			shutdownHandler,
			wsClient: deps.wsClient,
			serviceCache: deps.serviceCache,
			tokenManager: deps.tokenManager,
			addressManagerClient: deps.addressManagerClient,
			healthChecker: deps.healthChecker,
		})
	);
}
