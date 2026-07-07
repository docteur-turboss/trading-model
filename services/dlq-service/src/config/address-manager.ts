import { createServiceAddressManager } from "@trading-model/address-manager/create-service-address-manager";

import { ENV } from "./env";

const { AddressManager, FIND_A_SERVICE } = createServiceAddressManager(ENV);

export { AddressManager, FIND_A_SERVICE as findAService };
