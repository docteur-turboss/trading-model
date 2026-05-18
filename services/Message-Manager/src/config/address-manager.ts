/**
 * @file address-manager.ts
 *
 * @description
 * Composition module for the Address Manager client.
 *
 * This file instantiates and configures a singleton Address Manager
 * using environment-provided configuration, then exposes a limited
 * public API used by the rest of the application.
 *
 * It acts as an adapter layer between the application and the
 * `@trading-model/address-manager` package.
 *
 * @responsability
 * - Configure the Address Manager with runtime environment values
 * - Expose HTTP routes for service registration and discovery
 * - Expose helper functions to interact with the Address Manager
 * - Provide a single shared instance across the process
 *
 * @restrictions
 * - Must not contain business or domain logic
 * - Must not reconfigure the Address Manager after instantiation
 * - Must not expose the underlying instance directly
 *
 * @architecture
 * Infrastructure / integration layer.
 * This module wires external infrastructure into the application.
 *
 * @author docteur-turboss
 *
 * @version 1.0.0
 *
 * @since 2026.01.28
 */

import AddressManagerPackage from "@trading-model/address-manager";
import { env } from "./env";

/**
 * Singleton Address Manager instance.
 *
 * @description
 * Configured once at module load time using environment variables.
 * This instance is shared across the entire application lifecycle.
 */
const addressManager = new AddressManagerPackage({
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