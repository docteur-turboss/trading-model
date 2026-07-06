import { toInstanceId, toServiceId } from "@trading-model/common/domain/primitives";
import type { Port } from "@trading-model/common/domain/primitives";
import AddressManagerClass from "@trading-model/address-manager";

import { env } from "./env";

const ADDRESS_MANAGER = new AddressManagerClass({
	addressManagerUrl: env.ADDRESS_MANAGER_URL,
	discoveryUrls: [env.ADDRESS_MANAGER_URL],
	cacheTtlMs: env.CACHE_TTL_MS,
	discoveryTimeoutMs: env.DISCOVERY_TIMEOUT_MS,
	identity: {
		serviceName: toServiceId(env.SERVICE_NAME),
		instanceId: toInstanceId(env.INSTANCE_ID),
	},
	servicePingTimeoutMs: env.SERVICE_PING_TIMEOUT_MS,
	servicePort: env.PORT as Port,
	tokenRefreshIntervalMs: env.TOKEN_REFRESH_INTERVAL_MS,
	ttlRefreshIntervalMs: env.TTL_REFRESH_INTERVAL_MS,
	tls: {
		certPath: env.TLS_CERT_PATH,
		keyPath: env.TLS_KEY_PATH,
		caPath: env.TLS_CA_PATH,
	},
});

const BOOTSTRAP_ADDRESS_MANAGER = ADDRESS_MANAGER.start;
const ADDRESS_MANAGER_ROUTES = ADDRESS_MANAGER.listenExpress;

export {
	ADDRESS_MANAGER as AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
};
