import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";

import { ENV } from "./env";

const {
	AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
} = createServiceAddressManager(ENV);

export {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
};
