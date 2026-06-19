import { createTlsBootstrap } from '@trading-model/certificate-client';
import { warmupPool } from '@trading-model/certificate-utils/lazy-pool';
import { logger } from '@trading-model/common/config/logger';
import { createBootstrap } from '@trading-model/common/server/bootstrap';

import { createServer } from './server';
import { env } from '../config/env';

createBootstrap({
  name: 'CryptoWorker',
  createServer,
  tlsBootstrap: createTlsBootstrap(process.env as Record<string, string>),
  onStart: () => {
    const poolSize = env.WORKER_POOL_SIZE > 0 ? env.WORKER_POOL_SIZE : undefined;
    warmupPool(poolSize);
    logger.info('Crypto worker pool warmed up', { poolSize: poolSize ?? 'auto' });
  },
});
