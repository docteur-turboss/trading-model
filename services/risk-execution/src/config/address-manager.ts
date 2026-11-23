import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";
import { ENV } from "../infrastructure/config/env";

// No registration with discovery-server: no reader of the registry is left (ADR-0072).
export const { AddressManager, ADDRESS_MANAGER_ROUTES, FIND_A_SERVICE } =
	createServiceAddressManager(ENV);
