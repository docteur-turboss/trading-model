import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";
import { ENV } from "../infrastructure/config/env";

export const {
	ADDRESS_MANAGER_ROUTES,
	AddressManager,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
	REGISTRATION_READINESS,
} = createServiceAddressManager(ENV);
