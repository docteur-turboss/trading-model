import { createServiceAddressManager } from "@trading-model/address-manager/application/create-service-address-manager";

import { ENV } from "../infrastructure/config/env";

const {
	AddressManager,
	BOOTSTRAP_ADDRESS_MANAGER,
	ADDRESS_MANAGER_ROUTES,
	REGISTRATION_READINESS,
} = createServiceAddressManager(ENV);

export {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
	BOOTSTRAP_ADDRESS_MANAGER,
	REGISTRATION_READINESS,
};
