import AddressManager from "@trading-model/address-manager";
import { env } from "./env";

/**
 * Singleton Address Manager instance.
 *
 * @description
 * Configured once at module load time using environment variables.
 * This instance is shared across the entire application lifecycle.
 */
const addressManager = new AddressManager({
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
    RootCACertPath: env.TLS_CA_PATH
})

/**
 * Express route binder for the Address Manager.
 *
 * @description
 * Exposes HTTP endpoints required by the Address Manager
 * (e.g. service registration, heartbeat, discovery).
 *
 * This function is intended to be mounted directly on an Express app.
 *
 * @returns {void}
 *
 * @lifecycle
 * Must be called during HTTP server initialization.
 */
const AddressManagerRoutes = addressManager.listenExpress
const findAService = addressManager.findService
const bootstrapAddressManager = addressManager.start
export { AddressManagerRoutes, findAService, bootstrapAddressManager, addressManager as AddressManager }