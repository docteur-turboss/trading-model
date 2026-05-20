import { createAddressManager } from '@trading-model/address-manager/create-address-manager';
import { env } from './env';

const addressManager = createAddressManager(env);

const bootstrapAddressManager = addressManager.start;
const AddressManagerRoutes = addressManager.listenExpress;

export { AddressManagerRoutes, bootstrapAddressManager, addressManager as AddressManager };
