import { bootstrapAddressManager } from 'config/address-manager';
import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { createServer } from './server';
import 'config/env';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;

createBootstrap({
  name: 'Financial Scrapper',
  createServer,
  onStart: () => {
    addressManager = bootstrapAddressManager();
  },
  onStop: () => {
    if (addressManager) addressManager.stop();
  },
});
