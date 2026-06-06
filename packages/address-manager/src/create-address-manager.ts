import AddressManager from './index';

/** Environment variables required to configure and create an Address Manager instance. */
export interface AddressManagerEnv {
  ADDRESS_MANAGER_URL: string;
  CACHE_TTL_MS: number;
  INSTANCE_ID: string;
  SERVICE_NAME: string;
  SERVICE_PING_TIMEOUT_MS: number;
  PORT: number;
  TOKEN_REFRESH_INTERVAL_MS: number;
  TTL_REFRESH_INTERVAL_MS: number;
  TLS_CERT_PATH: string;
  TLS_KEY_PATH: string;
  TLS_CA_PATH: string;

  /**
   * Optional JSON mapping from logical service names to deployment-specific DNS names.
   * Example: '{"discovery-service":"discovery-server","message-delivery-service":"message-manager"}'
   */
  DNS_NAME_MAP?: string;
}

/** Creates and returns a fully configured Address Manager instance from environment variables. */
export function createAddressManager(env: AddressManagerEnv) {
  return new AddressManager({
    addressManagerUrl: env.ADDRESS_MANAGER_URL,
    cacheTtlMs: env.CACHE_TTL_MS,
    instanceId: env.INSTANCE_ID,
    serviceName: env.SERVICE_NAME,
    servicePingTimeoutMs: env.SERVICE_PING_TIMEOUT_MS,
    servicePort: env.PORT,
    tokenRefreshIntervalMs: env.TOKEN_REFRESH_INTERVAL_MS,
    ttlRefreshIntervalMs: env.TTL_REFRESH_INTERVAL_MS,
    CertificatPath: env.TLS_CERT_PATH,
    KeyCertificatPath: env.TLS_KEY_PATH,
    RootCACertPath: env.TLS_CA_PATH,
    dnsNameMap: env.DNS_NAME_MAP ? JSON.parse(env.DNS_NAME_MAP) : undefined,
  });
}
