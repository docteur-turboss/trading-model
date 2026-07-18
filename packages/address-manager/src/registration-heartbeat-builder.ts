import { HeartbeatManager } from "./heartbeat-manager";
import {
	DiscoveryResult,
	HEARTBEAT_TOTAL,
	REGISTRATION_TOTAL,
} from "./metrics";
import { RegistrationAttemptHandler } from "./registration-attempt-handler";
import type { ServiceClientDeps } from "./types";

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

export function buildHeartbeatManager(
	deps: ServiceClientDeps
): HeartbeatManager {
	return new HeartbeatManager({
		...deps,
		onSuccess: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Success }),
		onFailure: () => HEARTBEAT_TOTAL.inc({ result: DiscoveryResult.Failure }),
	});
}

export interface RegistrationAndHeartbeat {
	registrationManager: RegistrationAttemptHandler;
	heartbeatManager: HeartbeatManager;
}

export function buildRegistrationAndHeartbeat(
	deps: ServiceClientDeps
): RegistrationAndHeartbeat {
	return {
		registrationManager: buildRegistrationManager(deps),
		heartbeatManager: buildHeartbeatManager(deps),
	};
}
