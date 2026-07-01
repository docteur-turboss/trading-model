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

  RootCACertPath: string;
  CertificatePath: string;
  KeyCertificatePath: string;

  cacheTtlMs: number;
  maxCacheTtlMs?: number;
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

  // File-based cache dir
  discoveryCacheDir?: string;
  maxCacheEntries?: number;

  // Circuit breaker config
  circuitBreakerFailureThreshold?: number;
  circuitBreakerHalfOpenTimeoutMs?: number;
  circuitBreakerCooldownMs?: number;
  circuitBreakerCacheTtlMs?: number;
  circuitBreakerLatencyWindowSize?: number;
  circuitBreakerLatencyThresholdMs?: number;

  // Health check config
  healthCheckWindowSize?: number;
  healthCheckPassThreshold?: number;
  healthCheckPath?: string;
  healthCheckTlsOptions?: { ca: string; cert: string; key: string };

  // WebSocket config
  wsMaxQueueSize?: number;
  wsMaxBufferedAmount?: number;
}
export { AddressManagerConfig };
