import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import {
	DurationMs,
	InstanceId,
	type IPAddress,
	Port,
	ServiceId,
} from "@trading-model/primitives/primitives";
import AddressManager from "./address-manager";
import type { AddressManagerEnv } from "./config/address-manager-env";

export type { AddressManagerEnv };

/** Creates an AddressManager from the environment. */
export function createAddressManager(env: AddressManagerEnv) {
	return new AddressManager({
		addressManagerUrl: env.ADDRESS_MANAGER_URL,
		servicePort: Port.of(env.PORT),
		serviceVersion: env.APP_VERSION,
		tokenRefreshIntervalMs: DurationMs.of(env.TOKEN_REFRESH_INTERVAL_MS),
		ttlRefreshIntervalMs: DurationMs.of(env.TTL_REFRESH_INTERVAL_MS),
		identity: {
			serviceName: ServiceId.of(env.SERVICE_NAME),
			instanceId: InstanceId.of(env.INSTANCE_ID),
		},
		tls: buildTlsFromEnv(env),
		// as unknown as: env var is a JSON string parsed upstream into this map
		dnsNameMap: env.DNS_NAME_MAP as unknown as
			| Record<ServiceId, IPAddress>
			| undefined,
	});
}
