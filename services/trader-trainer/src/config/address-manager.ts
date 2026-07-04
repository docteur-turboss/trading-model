import AddressManagerClass from "@trading-model/address-manager";

import { env } from "./env";

const ADDRESS_MANAGER = new AddressManagerClass({
	addressManagerUrl: env.ADDRESS_MANAGER_URL,
	discoveryUrls: [env.ADDRESS_MANAGER_URL],
	cacheTtlMs: env.CACHE_TTL_MS,
	discoveryTimeoutMs: env.DISCOVERY_TIMEOUT_MS,
	instanceId: env.INSTANCE_ID,
	serviceName: env.SERVICE_NAME,
	servicePingTimeoutMs: env.SERVICE_PING_TIMEOUT_MS,
	servicePort: env.PORT,
	tokenRefreshIntervalMs: env.TOKEN_REFRESH_INTERVAL_MS,
	ttlRefreshIntervalMs: env.TTL_REFRESH_INTERVAL_MS,
	certificatePath: env.TLS_CERT_PATH,
	keyCertificatePath: env.TLS_KEY_PATH,
	rootCACertPath: env.TLS_CA_PATH,
});

const BOOTSTRAP_ADDRESS_MANAGER = ADDRESS_MANAGER.start;
const ADDRESS_MANAGER_ROUTES = ADDRESS_MANAGER.listenExpress;

export {
	ADDRESS_MANAGER as AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
};
