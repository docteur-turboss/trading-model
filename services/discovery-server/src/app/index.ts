import { createBootstrap } from '@trading-model/common/server/bootstrap';
import { LeaseManagerInstance } from '../core/lease-manager';
import { createServer } from './server';
import 'config/env';

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
