import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";

import { ENV } from "../infrastructure/config/env";

const {
	BOOTSTRAP_ADDRESS_MANAGER,
	ADDRESS_MANAGER_ROUTES,
	FIND_A_SERVICE,
	REGISTRATION_READINESS,
} = createServiceAddressManager(ENV);

export {
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
	REGISTRATION_READINESS,
};
