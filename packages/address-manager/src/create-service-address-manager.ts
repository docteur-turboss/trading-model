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
			am.findService(serviceName),
		/**
		 * Readiness check: false until this instance has registered with discovery once, then
		 * true. Kept in release N only, for N-1 gateways that still read the registry; removed
		 * with discovery-server in N+1 (ADR-0072).
		 */
		REGISTRATION_READINESS: {
			name: "discovery-registration",
			check: () => am.tokenManager.getTokenOrUndefined() !== undefined,
		},
	};
}
