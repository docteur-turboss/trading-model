/** Configuration options for the Address Manager client. */
interface AddressManagerConfig {
  instanceId: string;
  serviceName: string;
  servicePort: number;
  addressManagerUrl: string;

  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;
  discoveryTimeoutMs: number;

  RootCACertPath: string;
  CertificatPath: string;
  KeyCertificatPath: string;

  cacheTtlMs: number;

  /** Optional mapping from logical service names to deployment-specific DNS names. */
  dnsNameMap?: Record<string, string>;
}
export { AddressManagerConfig };
