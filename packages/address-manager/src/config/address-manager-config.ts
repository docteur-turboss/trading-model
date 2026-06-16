/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
  instanceId: string;
  serviceName: string;
  servicePort: number;
  /** Single discovery URL (backwards compatible). */
  addressManagerUrl: string;
  /** Ordered list of discovery URLs for multi-region failover.
   *  The client will try each URL in sequence on failure. */
  discoveryUrls: string[];

  /**
   * Local discovery server URL for region-scoped heartbeats.
   * When set together with `region`, heartbeats are sent to this URL first
   * instead of racing all discovery URLs — avoids cross-region round trips
   * on every heartbeat cycle.
   */
  localDiscoveryUrl?: string;

  /** Deployment region / datacenter identifier. */
  region?: string;

  /**
   * Public / external IP to advertise for cross-region connectivity.
   * When set, services in other regions connect via this IP instead of
   * the private (local) IP, which is not routable between regions.
   */
  publicIp?: string;

  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;
  discoveryTimeoutMs: number;

  RootCACertPath: string;
  CertificatePath: string;
  KeyCertificatePath: string;

  cacheTtlMs: number;

  /** Maximum cache TTL after adaptive scaling. Default: 120000. */
  maxCacheTtlMs?: number;

  /** Optional mapping from logical service names to deployment-specific DNS names. */
  dnsNameMap?: Record<string, string>;

  /** Interval (ms) between system metrics collections. Default: 15000. */
  metricsIntervalMs?: number;

  /** WebSocket URL for persistent connection to the discovery server (optional). */
  wsUrl?: string;

  /** Service names to subscribe to via WS push notifications. Defaults to ['*'] (all). */
  wsSubscribedServices?: string[];

  /** Max records retained by the service call tracker. Default: 1000. */
  maxCallRecords?: number;

  /** Preferred network interface name for local IP resolution (F42). E.g. "eth0". */
  preferredNetworkInterface?: string;
}
export { AddressManagerConfig };
