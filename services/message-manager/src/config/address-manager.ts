import { createAddressManager } from '@trading-model/address-manager/create-address-manager';
import { env } from './env';

const addressManager = createAddressManager(env);

const AddressManagerRoutes = addressManager.listenExpress;
const findAService = addressManager.findService;
const bootstrapAddressManager = addressManager.start;

export {
  AddressManagerRoutes,
  findAService,
  bootstrapAddressManager,
  addressManager as AddressManager,
};
