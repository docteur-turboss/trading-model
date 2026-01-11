interface AddressManagerConfig {
  instanceId: string;
  serviceName: string;
  servicePort: number;
  addressManagerUrl: string;

  tokenRefreshIntervalMs: number;
  ttlRefreshIntervalMs: number;
  servicePingTimeoutMs: number;

  cacheTtlMs: number;
}
export { AddressManagerConfig };