import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";
import { ENV } from "../infrastructure/config/env";

const { AddressManager, ADDRESS_MANAGER_ROUTES } =
	createServiceAddressManager(ENV);

export { ADDRESS_MANAGER_ROUTES, AddressManager };
