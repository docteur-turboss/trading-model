/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
	instanceId: string;
	serviceName: string;
	servicePort: number;
	/** Single discovery URL (backwards compatible). */
	addressManagerUrl: string;
	/** Ordered list of discovery URLs for multi-region failover. */
	discoveryUrls: string[];

	localDiscoveryUrl?: string;
	region?: string;
	publicIp?: string;

	tokenRefreshIntervalMs: number;
	ttlRefreshIntervalMs: number;
	servicePingTimeoutMs: number;
	discoveryTimeoutMs: number;

	rootCACertPath: string;
	certificatePath: string;
	keyCertificatePath: string;

	cacheTtlMs: number;
	dnsNameMap?: Record<string, string>;
	metricsIntervalMs?: number;

	wsUrl?: string;
	wsSubscribedServices?: string[];
	maxCallRecords?: number;
	preferredNetworkInterface?: string;

	// TLS cert PEM overrides (inline, not file paths)
	pems?: { ca: string; cert: string; key: string };

	// Redis cache config
	redisCacheUrl?: string;
	redisCacheOptions?: Record<string, unknown>;

	// Circuit breaker config
	circuitBreakerFailureThreshold?: number;
	circuitBreakerHalfOpenTimeoutMs?: number;
	circuitBreakerCacheTtlMs?: number;
	circuitBreakerLatencyWindowSize?: number;
	circuitBreakerLatencyThresholdMs?: number;
}

export type { AddressManagerConfig };
