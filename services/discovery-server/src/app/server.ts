import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { env } from '../config/env';
import { heartbeatRoutes } from '../routes/heartbeat.routes';
import { registryRoutes } from '../routes/register.routes';

/** Create and return an HTTPS server with mounted registry and heartbeat routes. */
export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/', registryRoutes());
      app.use('/', heartbeatRoutes());
    },
  });
}
