import type { IPAddress, Port } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
	identity: ServiceIdentity;
	servicePort: Port;
	/** Single discovery URL (backwards compatible). */
	addressManagerUrl: string;
	/** Ordered list of discovery URLs for multi-region failover. */
	discoveryUrls: string[];

	localDiscoveryUrl?: string;
	publicIp?: IPAddress;

	tls: TlsPaths;
	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	servicePingTimeoutMs: number;
	discoveryTimeoutMs: number;

	cacheTtlMs: number;
	dnsNameMap?: Record<string, string>;
	metricsIntervalMs?: number;

	wsUrl?: string;
	wsSubscribedServices?: string[];
	maxCallRecords?: number;
	preferredNetworkInterface?: string;

	pems?: TlsPaths;

	redisCacheUrl?: string;
	redisCacheOptions?: Record<string, unknown>;

	circuitBreakerFailureThreshold?: number;
	circuitBreakerHalfOpenTimeoutMs?: number;
	circuitBreakerCacheTtlMs?: number;
	circuitBreakerLatencyWindowSize?: number;
	circuitBreakerLatencyThresholdMs?: number;
}

export type { AddressManagerConfig };
