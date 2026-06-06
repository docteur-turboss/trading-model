import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { LeaseManagerInstance } from '../core/lease-manager';
import '../config/env';

createBootstrap({
  name: 'Discovery',
  createServer,
  onStart: () => {
    LeaseManagerInstance.start();
  },
  onStop: () => {
    LeaseManagerInstance.stop();
  },
});
