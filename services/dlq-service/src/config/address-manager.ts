import { createAddressManager } from "@trading-model/address-manager/create-address-manager";

import { env } from "./env";

const addressManager = createAddressManager(env);

const findAService = addressManager.findService.bind(addressManager);

export { addressManager as AddressManager, findAService };
