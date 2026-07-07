import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";

import { ENV } from "./env";

const { AddressManager, BOOTSTRAP_ADDRESS_MANAGER, ADDRESS_MANAGER_ROUTES } =
	createServiceAddressManager(ENV);

export { AddressManager, ADDRESS_MANAGER_ROUTES, BOOTSTRAP_ADDRESS_MANAGER };
