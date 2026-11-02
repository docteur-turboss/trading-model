import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { Application } from "express";
import {
	type AddressManagerEnv,
	createAddressManager,
} from "./create-address-manager";

export function createServiceAddressManager(env: AddressManagerEnv) {
	const am = createAddressManager(env);
	return {
		AddressManager: am,
		BOOTSTRAP_ADDRESS_MANAGER: () => am.lifecycleManager.start(),
		ADDRESS_MANAGER_ROUTES: (app: Application) =>
			am.metricsCollector.listenExpress(app),
		FIND_A_SERVICE: (serviceName: ServiceInstanceName) =>
			am.discoveryOrchestrator.findService(serviceName),
	};
}
