import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { env } from '../config/env';
import { LeaseManager } from '../core/lease-manager';
import { ServiceRegistry } from '../core/service-registry';

const registry = new ServiceRegistry();
const leaseManager = new LeaseManager(registry, {
  cleanupIntervalMs: env.CLEANUP_SERVICE_INTERVAL_MS,
});

createBootstrap({
  name: 'Discovery',
  createServer: () => createServer(registry),
  onStart: () => {
    leaseManager.start();
  },
  onStop: () => {
    leaseManager.stop();
  },
});
