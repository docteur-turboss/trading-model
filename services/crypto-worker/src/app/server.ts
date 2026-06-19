import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { env } from '../config/env';
import { cryptoRoutes } from '../routes/crypto.routes';

export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/api/v1/crypto', cryptoRoutes());
    },
  });
}
