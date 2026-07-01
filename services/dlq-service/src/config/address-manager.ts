import { createAddressManager } from '@trading-model/address-manager/create-address-manager';

import { env } from './env';

const addressManager = createAddressManager(env);

const findAService = addressManager.findService.bind(addressManager);
const findAllServices = addressManager.findAllServices.bind(addressManager);

export { findAService, findAllServices, addressManager as AddressManager };
