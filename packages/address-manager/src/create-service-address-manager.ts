import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Application } from "express";
import {
	type AddressManagerEnv,
	createAddressManager,
} from "./create-address-manager";

/** Creates the address manager of a service with its routes and lookup function. */
export function createServiceAddressManager(env: AddressManagerEnv) {
	const am = createAddressManager(env);
	return {
		AddressManager: am,
		ADDRESS_MANAGER_ROUTES: (app: Application) =>
			am.metricsCollector.listenExpress(app),
		FIND_A_SERVICE: (serviceName: ServiceInstanceName) =>
			am.findService(serviceName),
	};
}
