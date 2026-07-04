import { createAddressManager } from "@trading-model/address-manager/create-address-manager";

import { env } from "./env";

const ADDRESS_MANAGER = createAddressManager(env);

const BOOTSTRAP_ADDRESS_MANAGER = ADDRESS_MANAGER.start;
const ADDRESS_MANAGER_ROUTES = ADDRESS_MANAGER.listenExpress;

export {
	ADDRESS_MANAGER as AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
};
