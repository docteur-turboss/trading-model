import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type AddressManagerEnv,
	createAddressManager,
} from "./create-address-manager";

/** Creates the address manager of a service with its lookup function. */
export function createServiceAddressManager(env: AddressManagerEnv) {
	const am = createAddressManager(env);
	return {
		AddressManager: am,
		FIND_A_SERVICE: (serviceName: ServiceInstanceName) =>
			am.findService(serviceName),
	};
}
