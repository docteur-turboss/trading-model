import { createServiceAddressManager } from "@trading-model/address-manager/application/create-service-address-manager";

import { ENV } from "../infrastructure/config/env";

const { AddressManager, FIND_A_SERVICE, REGISTRATION_READINESS } =
	createServiceAddressManager(ENV);

export { AddressManager, FIND_A_SERVICE, REGISTRATION_READINESS };
