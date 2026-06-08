import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { AddressManagerRoutes } from '../config/address-manager';
import { env } from '../config/env';
import { MessageManagerRoutes } from '../config/message-manager';

/** Create and return an HTTPS server with mounted address-manager and message-manager routes. */
export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    trustProxy: true,
    routes: app => {
      AddressManagerRoutes(app);
      MessageManagerRoutes(app);
    },
  });
}
