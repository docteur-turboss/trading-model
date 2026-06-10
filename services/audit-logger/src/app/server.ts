import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { AddressManagerRoutes } from '../config/address-manager';
import { env } from '../config/env';
import { AuditRepository } from '../persistence/audit-repository';
import { eventsRoutes } from '../routes/events.routes';
import { healthRoutes } from '../routes/health.routes';
import { JobScheduler } from '../scheduler/job-scheduler';
import { createMessageHandler } from '../subscription/audit-subscriber';

export function createServer(scheduler: JobScheduler, auditRepo: AuditRepository) {
  const messageHandler = createMessageHandler(auditRepo);

  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    trustProxy: true,
    routes: app => {
      app.use('/', healthRoutes(scheduler.queue, scheduler.backPressure, scheduler.workers));
      app.use('/', eventsRoutes(auditRepo));
      app.post('/message', messageHandler);
      AddressManagerRoutes(app);
    },
  });
}
