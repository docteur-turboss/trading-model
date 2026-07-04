import { createAddressManager } from "@trading-model/address-manager/create-address-manager";

import { env } from "./env";

const ADDRESS_MANAGER = createAddressManager(env);

/** Express route binder for address-manager HTTP endpoints. */
const ADDRESS_MANAGER_ROUTES = ADDRESS_MANAGER.listenExpress;

/** Resolve a service instance's address for a given service name. */
const FIND_A_SERVICE = ADDRESS_MANAGER.findService;

/** Start the address manager's background lifecycle (e.g. periodic service resolution). */
const BOOTSTRAP_ADDRESS_MANAGER = ADDRESS_MANAGER.start;

export {
	ADDRESS_MANAGER as AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
	FIND_A_SERVICE,
};
