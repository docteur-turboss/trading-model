import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "../infrastructure/metrics";
import { HeartbeatManager } from "./heartbeat-manager";
import { RegistrationAttemptHandler } from "./registration-attempt-handler";
import type { ServiceClientDeps } from "./types";

/** Builds the registration manager from its dependencies. */
export function buildRegistrationManager(
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

/** Builds the heartbeat manager from its dependencies. */
export function buildHeartbeatManager(
	deps: ServiceClientDeps
): HeartbeatManager {
	return new HeartbeatManager({
		...deps,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

/** Registration and heartbeat managers built together. */
export interface RegistrationAndHeartbeat {
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
}

/** Builds the registration and heartbeat managers together. */
export function buildRegistrationAndHeartbeat(
	deps: ServiceClientDeps
): RegistrationAndHeartbeat {
	return {
		registrationManager: buildRegistrationManager(deps),
		heartbeatManager: buildHeartbeatManager(deps),
	};
}
