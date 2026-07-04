import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";

import AddressManager from "./index";

/** Environment variables required to configure and create an Address Manager instance. */
export interface AddressManagerEnv {
	addressManagerUrl: string;
	addressManagerUrls?: string;
	cacheTtlMs: number;
	discoveryTimeoutMs: number;
	instanceId: string;
	serviceName: string;
	servicePingTimeoutMs: number;
	port: number;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	tlsCertPath: string;
	tlsKeyPath: string;
	tlsCaPath: string;

	/** Deployment region / datacenter identifier. */
	region?: string;

	/**
	 * Public / external IP to advertise for cross-region connectivity.
	 * When set, this IP is used for registration instead of the local (private) IP,
	 * so services in other regions can reach this instance.
	 */
	publicIp?: string;

	/**
	 * Local discovery server URL for region-scoped heartbeats.
	 * When set (together with REGION), heartbeats are sent to this URL first,
	 * avoiding cross-region round trips on every heartbeat cycle.
	 */
	localDiscoveryUrl?: string;

	/** Optional JSON mapping from logical service names to deployment-specific DNS names. */
	dnsNameMap?: Record<string, string>;

	/** Interval (ms) between system metrics collections. Default: 15000. */
	metricsIntervalMs?: number;

	/** WebSocket URL for persistent connection to the discovery server (optional). */
	wsUrl?: string;

	/**
	 * JSON array of service names to subscribe to via WS push notifications.
	 * Defaults to ['*'] (all services) when WS is configured.
	 */
	wsSubscribedServices?: string;

	/** Max records retained by the service call tracker. Default: 1000. */
	maxCallRecords?: number;

	/**
	 * Preferred network interface name for local IP resolution (F42).
	 * In multi-interface environments (Kubernetes overlay, Docker bridge),
	 * use this to select the correct routable interface. E.g. "eth0".
	 */
	preferredNetworkInterface?: string;
}

/** Creates and returns a fully configured Address Manager instance from environment variables. */
export function createAddressManager(env: AddressManagerEnv) {
	const discoveryUrls = resolveDiscoveryUrls(
		env.addressManagerUrl,
		env.addressManagerUrls
	);
	const wsSubscribedServices = resolveWsSubscribedServices(
		env.wsSubscribedServices
	);

	return new AddressManager({
		addressManagerUrl: env.addressManagerUrl,
		discoveryUrls,
		localDiscoveryUrl: env.localDiscoveryUrl,
		cacheTtlMs: env.cacheTtlMs,
		discoveryTimeoutMs: env.discoveryTimeoutMs,
		instanceId: env.instanceId,
		serviceName: env.serviceName,
		servicePingTimeoutMs: env.servicePingTimeoutMs,
		servicePort: env.port,
		region: env.region,
		publicIp: env.publicIp,
		tokenRefreshIntervalMs: env.tokenRefreshIntervalMs,
		ttlRefreshIntervalMs: env.ttlRefreshIntervalMs,
		certificatePath: env.tlsCertPath,
		keyCertificatePath: env.tlsKeyPath,
		rootCACertPath: env.tlsCaPath,
		dnsNameMap: env.dnsNameMap,
		metricsIntervalMs: env.metricsIntervalMs,
		wsUrl: env.wsUrl,
		wsSubscribedServices,
		maxCallRecords: env.maxCallRecords,
		preferredNetworkInterface: env.preferredNetworkInterface,
	});
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
