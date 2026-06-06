import { createAddressManager } from '@trading-model/address-manager/create-address-manager';

import { env } from './env';

const addressManager = createAddressManager(env);

/** Express route binder for address-manager HTTP endpoints. */
const AddressManagerRoutes = addressManager.listenExpress;

/** Resolve a service instance's address for a given service name. */
const findAService = addressManager.findService;

/** Start the address manager's background lifecycle (e.g. periodic service resolution). */
const bootstrapAddressManager = addressManager.start;

export {
  AddressManagerRoutes,
  findAService,
  bootstrapAddressManager,
  addressManager as AddressManager,
};
