import { toServiceId, toInstanceId, toRegion } from "@trading-model/common/domain/primitives";
import type { IPAddress, Port } from "@trading-model/common/domain/primitives";
import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import AddressManager from "./index";

/** Environment variables required to configure and create an Address Manager instance. */
export interface AddressManagerEnv {
	ADDRESS_MANAGER_URL: string;
	ADDRESS_MANAGER_URLS?: string;
	CACHE_TTL_MS: number;
	DISCOVERY_TIMEOUT_MS: number;
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	SERVICE_PING_TIMEOUT_MS: number;
	PORT: number;
	TOKEN_REFRESH_INTERVAL_MS: number;
	TTL_REFRESH_INTERVAL_MS: number;
	TLS_CERT_PATH: string;
	TLS_KEY_PATH: string;
	TLS_CA_PATH: string;

	/** Deployment region / datacenter identifier. */
	REGION?: string;

	/**
	 * Public / external IP to advertise for cross-region connectivity.
	 * When set, this IP is used for registration instead of the local (private) IP,
	 * so services in other regions can reach this instance.
	 */
	PUBLIC_IP?: string;

	/**
	 * Local discovery server URL for region-scoped heartbeats.
	 * When set (together with REGION), heartbeats are sent to this URL first,
	 * avoiding cross-region round trips on every heartbeat cycle.
	 */
	LOCAL_DISCOVERY_URL?: string;

	/** Optional JSON mapping from logical service names to deployment-specific DNS names. */
	DNS_NAME_MAP?: Record<string, string>;

	/** Interval (ms) between system metrics collections. Default: 15000. */
	METRICS_INTERVAL_MS?: number;

	/** WebSocket URL for persistent connection to the discovery server (optional). */
	WS_URL?: string;

	/**
	 * JSON array of service names to subscribe to via WS push notifications.
	 * Defaults to ['*'] (all services) when WS is configured.
	 */
	WS_SUBSCRIBED_SERVICES?: string;

	/** Max records retained by the service call tracker. Default: 1000. */
	MAX_CALL_RECORDS?: number;

	/**
	 * Preferred network interface name for local IP resolution (F42).
	 * In multi-interface environments (Kubernetes overlay, Docker bridge),
	 * use this to select the correct routable interface. E.g. "eth0".
	 */
	PREFERRED_NETWORK_INTERFACE?: string;
}

/** Creates and returns a fully configured Address Manager instance from environment variables. */
export function createAddressManager(env: AddressManagerEnv) {
	const discoveryUrls = resolveDiscoveryUrls(
		env.ADDRESS_MANAGER_URL,
		env.ADDRESS_MANAGER_URLS,
	);
	const wsSubscribedServices = resolveWsSubscribedServices(
		env.WS_SUBSCRIBED_SERVICES,
	);
	return new AddressManager(_buildAddressManagerConfig(env, discoveryUrls, wsSubscribedServices));
}

function _buildAddressManagerConfig(
	env: AddressManagerEnv,
	discoveryUrls: string[],
	wsSubscribedServices: string[] | undefined,
): ConstructorParameters<typeof AddressManager>[0] {
	return {
		addressManagerUrl: env.ADDRESS_MANAGER_URL,
		discoveryUrls,
		localDiscoveryUrl: env.LOCAL_DISCOVERY_URL,
		cacheTtlMs: env.CACHE_TTL_MS,
		discoveryTimeoutMs: env.DISCOVERY_TIMEOUT_MS,
		identity: _buildIdentity(env),
		servicePingTimeoutMs: env.SERVICE_PING_TIMEOUT_MS,
		servicePort: env.PORT as Port,
		publicIp: env.PUBLIC_IP as IPAddress | undefined,
		tokenRefreshIntervalMs: env.TOKEN_REFRESH_INTERVAL_MS,
		ttlRefreshIntervalMs: env.TTL_REFRESH_INTERVAL_MS,
		tls: _buildTls(env),
		dnsNameMap: env.DNS_NAME_MAP,
		metricsIntervalMs: env.METRICS_INTERVAL_MS,
		wsUrl: env.WS_URL,
		wsSubscribedServices,
		maxCallRecords: env.MAX_CALL_RECORDS,
		preferredNetworkInterface: env.PREFERRED_NETWORK_INTERFACE,
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
	return {
		caPath: env.TLS_CA_PATH,
		certPath: env.TLS_CERT_PATH,
		keyPath: env.TLS_KEY_PATH,
	};
}

/**
 * Parse the WS_SUBSCRIBED_SERVICES env var, returning undefined if not set or invalid.
 * Expected format: JSON array of service names, e.g. '["service-a","service-b"]'.
 */
function resolveWsSubscribedServices(raw?: string): string[] | undefined {
	if (!raw) {
		return;
	}
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed.map(String);
		}
	} catch (err) {
		logger.warn(
			"Failed to parse WS_SUBSCRIBED_SERVICES, subscribing to all services",
			{
				err: normalizeError(err),
			}
		);
	}
}

function resolveDiscoveryUrls(singleUrl: string, urlsJson?: string): string[] {
	if (urlsJson) {
		try {
			const parsed = JSON.parse(urlsJson);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed.map(String);
			}
		} catch (err) {
			logger.warn(
				"Failed to parse ADDRESS_MANAGER_URLS, falling back to single URL",
				{
					err: normalizeError(err),
				}
			);
		}
	}
	return [singleUrl];
}
