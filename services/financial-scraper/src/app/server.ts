import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';

import { FinancialRoutes } from '../clients/http/routes';
import { AddressManagerRoutes } from '../config/address-manager';
import { env } from '../config/env';
import { MessageManagerListenExpress } from '../config/message-manager';

/** Create and return a secure Express server configured with TLS, financial routes, address manager, and message manager. */
export function createServer() {
  return createSecureServer({
    port: env.PORT,
    tls: loadTlsConfig(env),
    routes: app => {
      app.use('/', FinancialRoutes());
      AddressManagerRoutes(app);
      MessageManagerListenExpress(app);
    },
  });
}
