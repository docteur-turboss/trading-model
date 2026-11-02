import { createServiceAddressManager } from "@trading-model/address-manager/application/create-service-address-manager";

import { ENV } from "../infrastructure/config/env";

const { ADDRESS_MANAGER_ROUTES, BOOTSTRAP_ADDRESS_MANAGER, FIND_A_SERVICE } =
	createServiceAddressManager(ENV);

export { ADDRESS_MANAGER_ROUTES, BOOTSTRAP_ADDRESS_MANAGER, FIND_A_SERVICE };
