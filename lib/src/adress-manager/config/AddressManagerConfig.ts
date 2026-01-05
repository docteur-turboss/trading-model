interface AddressManagerConfig {
  serviceName: string;
  servicePort: number;
  addressManagerUrl: string;

  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;

  cacheTtlMs: number;
}
export { AddressManagerConfig };