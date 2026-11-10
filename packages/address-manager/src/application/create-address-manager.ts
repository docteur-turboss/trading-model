import { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
import {
	DurationMs,
	type IPAddress,
	Port,
	type ServiceId,
	toInstanceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { AddressManagerEnv } from "../infrastructure/config/address-manager-env";
import AddressManager from "./address-manager";

export type { AddressManagerEnv };

export function createAddressManager(env: AddressManagerEnv) {
	return new AddressManager(_buildAddressManagerConfig(env));
}

function _buildAddressManagerConfig(env: AddressManagerEnv) {
	return {
		..._buildCoreConfig(env),
		identity: _buildIdentity(env),
		tls: _buildTls(env),
		..._buildOptionalConfig(env),
	};
}

function _buildCoreConfig(env: AddressManagerEnv) {
	return {
		addressManagerUrl: env.ADDRESS_MANAGER_URL,
		cacheTtlMs: DurationMs.of(env.CACHE_TTL_MS),
		discoveryTimeoutMs: DurationMs.of(env.DISCOVERY_TIMEOUT_MS),
		servicePingTimeoutMs: DurationMs.of(env.SERVICE_PING_TIMEOUT_MS),
		servicePort: Port.of(env.PORT),
		serviceVersion: env.APP_VERSION,
		tokenRefreshIntervalMs: DurationMs.of(env.TOKEN_REFRESH_INTERVAL_MS),
		ttlRefreshIntervalMs: DurationMs.of(env.TTL_REFRESH_INTERVAL_MS),
	};
}

function _buildOptionalConfig(env: AddressManagerEnv) {
	return {
		// as unknown as: env var is a JSON string parsed upstream into this map
		dnsNameMap: env.DNS_NAME_MAP as unknown as
			| Record<ServiceId, IPAddress>
			| undefined,
	};
}

function _buildIdentity(env: AddressManagerEnv) {
	return {
		serviceName: toServiceId(env.SERVICE_NAME),
		instanceId: toInstanceId(env.INSTANCE_ID),
	};
}

function _buildTls(env: AddressManagerEnv) {
	return buildTlsFromEnv(env);
}
