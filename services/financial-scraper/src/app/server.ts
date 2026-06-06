import { createSecureServer } from '@trading-model/common/server/create-secure-server';
import { loadTlsConfig } from '@trading-model/common/server/load-tls-config';
import { MessageManagerListenExpress } from '../config/message-manager';
import { AddressManagerRoutes } from '../config/address-manager';
import { FinancialRoutes } from '../clients/http/routes';
import { env } from '../config/env';

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
