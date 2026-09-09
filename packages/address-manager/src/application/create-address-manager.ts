import {
	DurationMs,
	IPAddress,
	Port,
	PositiveInt,
	ServiceId,
	toInstanceId,
	toRegion,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { buildTlsFromEnv } from "@trading-model/common/domain/tls-paths";
import {
	type AddressManagerEnv,
	resolveDiscoveryUrls,
	resolveWsSubscribedServices,
} from "../infrastructure/config/address-manager-env";
import AddressManager from "./address-manager";

export type { AddressManagerEnv };

export function createAddressManager(env: AddressManagerEnv) {
	const discoveryUrls = resolveDiscoveryUrls(
		env.ADDRESS_MANAGER_URL,
		env.ADDRESS_MANAGER_URLS
	);
	const wsSubscribedServices = resolveWsSubscribedServices(
		env.WS_SUBSCRIBED_SERVICES
	);
	return new AddressManager(
		_buildAddressManagerConfig(env, discoveryUrls, wsSubscribedServices)
	);
}

function _buildAddressManagerConfig(
	env: AddressManagerEnv,
	discoveryUrls: string[],
	wsSubscribedServices: string[] | undefined
) {
	return {
		..._buildCoreConfig(env, discoveryUrls),
		identity: _buildIdentity(env),
		tls: _buildTls(env),
		..._buildOptionalConfig(env, wsSubscribedServices),
	};
}

function _buildCoreConfig(env: AddressManagerEnv, discoveryUrls: string[]) {
	return {
		addressManagerUrl: env.ADDRESS_MANAGER_URL,
		discoveryUrls,
		localDiscoveryUrl: env.LOCAL_DISCOVERY_URL,
		cacheTtlMs: DurationMs.of(env.CACHE_TTL_MS),
		discoveryTimeoutMs: DurationMs.of(env.DISCOVERY_TIMEOUT_MS),
		servicePingTimeoutMs: DurationMs.of(env.SERVICE_PING_TIMEOUT_MS),
		servicePort: Port.of(env.PORT),
		publicIp: env.PUBLIC_IP ? IPAddress.of(env.PUBLIC_IP) : undefined,
		tokenRefreshIntervalMs: DurationMs.of(env.TOKEN_REFRESH_INTERVAL_MS),
		ttlRefreshIntervalMs: DurationMs.of(env.TTL_REFRESH_INTERVAL_MS),
		preferredNetworkInterface: env.PREFERRED_NETWORK_INTERFACE,
	};
}

function _buildOptionalConfig(
	env: AddressManagerEnv,
	wsSubscribedServices: string[] | undefined
) {
	return {
		dnsNameMap: env.DNS_NAME_MAP as unknown as
			| Record<ServiceId, IPAddress>
			| undefined,
		metricsIntervalMs: env.METRICS_INTERVAL_MS
			? DurationMs.of(env.METRICS_INTERVAL_MS)
			: undefined,
		wsUrl: env.WS_URL,
		wsSubscribedServices: wsSubscribedServices?.map(ServiceId.of),
		maxCallRecords: env.MAX_CALL_RECORDS
			? PositiveInt.of(env.MAX_CALL_RECORDS)
			: undefined,
	};
}

function _buildIdentity(env: AddressManagerEnv) {
	return {
		serviceName: toServiceId(env.SERVICE_NAME),
		instanceId: toInstanceId(env.INSTANCE_ID),
		region: env.REGION ? toRegion(env.REGION) : undefined,
	};
}

function _buildTls(env: AddressManagerEnv) {
	return buildTlsFromEnv(env);
}
