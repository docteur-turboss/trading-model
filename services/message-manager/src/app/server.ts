import { createSecureServer } from "@trading-model/common/server/createSecureServer";
import { AddressManagerRoutes } from "config/address-manager";
import { MessageManagerRoutes } from "config/message-manager";
import { env } from "config/env";

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
    routes: (app) => {
      AddressManagerRoutes(app);
      MessageManagerRoutes(app);
    },
  });
}
