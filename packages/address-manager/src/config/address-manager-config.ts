/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
  instanceId: string;
  serviceName: string;
  servicePort: number;
  addressManagerUrl: string;

  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;

  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;

  cacheTtlMs: number;

  /**
   * Optional mapping from logical service names to deployment-specific DNS names.
   * When set, the health checker uses these DNS names instead of the logical
   * service name when constructing ping URLs. This allows the library to remain
   * orchestrator-agnostic.
   *
   * @example
   * ```ts
   * {
   *   "discovery-service": "discovery-server",
   *   "message-delivery-service": "message-manager",
   * }
   * ```
   */
  dnsNameMap?: Record<string, string>;
}
export { AddressManagerConfig };
