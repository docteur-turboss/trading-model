import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { env } from '../config/env';
import { certificateRoutes } from '../routes/certificate.routes';
import { crlRoutes } from '../routes/crl.routes';
import { healthRoutes } from '../routes/health.routes';

export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/', healthRoutes());
      app.use('/api/v1/certificate', certificateRoutes());
      app.use('/api/v1', crlRoutes());
    },
  });
}
