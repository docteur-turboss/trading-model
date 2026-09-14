/**
 * Instantiates a Broker client with TLS config and exposes its HTTP listener.
 */

import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import createBrokerModule from "../application/index";
import { ENV } from "../infrastructure/config/env";

/**
 * Broker singleton, instantiated at module load time.
 */
const BROKER = createBrokerModule(buildTlsFromEnv(ENV));

/**
 * HTTP route binder to be mounted on an Express app instance.
 */
const MESSAGE_MANAGER_ROUTES = BROKER.listen;

export { MESSAGE_MANAGER_ROUTES };
