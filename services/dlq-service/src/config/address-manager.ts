import { createAddressManager } from "@trading-model/address-manager/create-address-manager";

import { ENV } from "./env";

const addressManager = createAddressManager(ENV);

const findAService = addressManager.findService.bind(addressManager);

export { addressManager as AddressManager, findAService };

