import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { heartbeatRoutes } from '../routes/heartbeat.routes';
import { registryRoutes } from '../routes/register.routes';
import { env } from 'config/env';

export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: {
      key: env.TLS_KEY_PATH,
      cert: env.TLS_CERT_PATH,
      ca: env.TLS_CA_PATH,
    },
    rateLimit: {
      windowMs: 15 * 60 * 1000,
      limit: 100,
    },
    routes: app => {
      app.use('/', registryRoutes());
      app.use('/', heartbeatRoutes());
    },
  });
}
