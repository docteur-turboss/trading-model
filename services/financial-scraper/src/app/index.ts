import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { bootstrapAddressManager } from '../config/address-manager';
import '../config/env';

let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null;

createBootstrap({
  name: 'Financial Scraper',
  createServer,
  onStart: () => {
    addressManager = bootstrapAddressManager();
  },
  onStop: () => {
    if (addressManager) addressManager.stop();
  },
});
