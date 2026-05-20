import AddressManagerClass from '@trading-model/address-manager';
import { env } from './env';

const addressManager = new AddressManagerClass({
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
});

const bootstrapAddressManager = addressManager.start;
const AddressManagerRoutes = addressManager.listenExpress;

export { AddressManagerRoutes, bootstrapAddressManager, addressManager as AddressManager };
