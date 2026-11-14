import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Application } from "express";
import {
	type AddressManagerEnv,
	createAddressManager,
} from "./create-address-manager";

/** Creates the address manager of a service with its bootstrap, routes and lookup functions. */
export function createServiceAddressManager(env: AddressManagerEnv) {
	const am = createAddressManager(env);
	return {
		AddressManager: am,
		BOOTSTRAP_ADDRESS_MANAGER: () => am.lifecycleManager.start(),
		ADDRESS_MANAGER_ROUTES: (app: Application) =>
			am.metricsCollector.listenExpress(app),
		FIND_A_SERVICE: (serviceName: ServiceInstanceName) =>
			am.discovery.findService(serviceName),
		/**
		 * Readiness check: false until this instance has registered with discovery once, then
		 * true. The token is set by the first successful registration and never cleared, so a
		 * later discovery or Redis outage keeps the pod Ready.
		 */
		REGISTRATION_READINESS: {
			name: "discovery-registration",
			check: () => am.tokenManager.getTokenOrUndefined() !== undefined,
		},
	};
}
