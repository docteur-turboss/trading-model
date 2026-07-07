import AddressManagerClass from "@trading-model/address-manager";
import type { Port } from "@trading-model/common/domain/primitives";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";

import { ENV } from "./env";

const ADDRESS_MANAGER = new AddressManagerClass({
	addressManagerUrl: ENV.ADDRESS_MANAGER_URL,
	discoveryUrls: [ENV.ADDRESS_MANAGER_URL],
	cacheTtlMs: ENV.CACHE_TTL_MS,
	discoveryTimeoutMs: ENV.DISCOVERY_TIMEOUT_MS,
	identity: {
		serviceName: toServiceId(ENV.SERVICE_NAME),
		instanceId: toInstanceId(ENV.INSTANCE_ID),
	},
	servicePingTimeoutMs: ENV.SERVICE_PING_TIMEOUT_MS,
	servicePort: ENV.PORT as Port,
	tokenRefreshIntervalMs: ENV.TOKEN_REFRESH_INTERVAL_MS,
	ttlRefreshIntervalMs: ENV.TTL_REFRESH_INTERVAL_MS,
	tls: {
		certPath: ENV.TLS_CERT_PATH,
		keyPath: ENV.TLS_KEY_PATH,
		caPath: ENV.TLS_CA_PATH,
	},
});

const BOOTSTRAP_ADDRESS_MANAGER = ADDRESS_MANAGER.start;
const ADDRESS_MANAGER_ROUTES = ADDRESS_MANAGER.listenExpress;

export {
	ADDRESS_MANAGER as AddressManager,
	ADDRESS_MANAGER_ROUTES,
	BOOTSTRAP_ADDRESS_MANAGER,
};
