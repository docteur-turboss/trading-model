import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";
import { ENV } from "../infrastructure/config/env";

export const { FIND_A_SERVICE } = createServiceAddressManager(ENV);
