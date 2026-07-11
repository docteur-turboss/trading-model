import type {
	DurationMs,
	IPAddress,
	Port,
	PositiveInt,
	ServiceId,
} from "@trading-model/common/domain/primitives";
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
	tokenRefreshIntervalMs: DurationMs;
	ttlRefreshIntervalMs: DurationMs;
	servicePingTimeoutMs: DurationMs;
	discoveryTimeoutMs: DurationMs;

	cacheTtlMs: DurationMs;
	dnsNameMap?: Record<ServiceId, IPAddress>;
	metricsIntervalMs?: DurationMs;

	wsUrl?: string;
	wsSubscribedServices?: ServiceId[];
	maxCallRecords?: PositiveInt;
	preferredNetworkInterface?: string;

	pems?: TlsPaths;

	redisCacheUrl?: string;
	redisCacheOptions?: Record<string, unknown>;

	circuitBreakerFailureThreshold?: PositiveInt;
	circuitBreakerHalfOpenTimeoutMs?: DurationMs;
	circuitBreakerCacheTtlMs?: DurationMs;
	circuitBreakerLatencyWindowSize?: PositiveInt;
	circuitBreakerLatencyThresholdMs?: DurationMs;
}

export type { AddressManagerConfig };
