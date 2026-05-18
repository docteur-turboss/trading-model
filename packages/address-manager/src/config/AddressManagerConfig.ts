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
}
export { AddressManagerConfig };