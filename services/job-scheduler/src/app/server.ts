import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { AddressManagerRoutes } from '../config/address-manager';
import { env } from '../config/env';
import { ackRoutes } from '../routes/ack.routes';
import { healthRoutes } from '../routes/health.routes';
import { jobRoutes } from '../routes/job.routes';
import { workerRoutes } from '../routes/worker.routes';
import { JobScheduler } from '../scheduler/job-scheduler';

export function createServer(scheduler: JobScheduler) {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/', jobRoutes(scheduler));
      app.use('/', ackRoutes(scheduler));
      app.use('/', workerRoutes(scheduler.workers));
      app.use('/', healthRoutes(scheduler.queue, scheduler.backPressure, scheduler.workers));
      AddressManagerRoutes(app);
    },
  });
}
