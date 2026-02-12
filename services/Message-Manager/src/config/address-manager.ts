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
 * `cash-lib` address manager implementation.
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

import address from "cash-lib/adress-manager/index";
import { env } from "./env";

/**
 * Singleton Address Manager instance.
 *
 * @description
 * Configured once at module load time using environment variables.
 * This instance is shared across the entire application lifecycle.
 */
const AddressManager = new address({
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
const AddressManagerRoutes = AddressManager.listenExpress

/**
 * Service discovery helper.
 *
 * @description
 * Resolves a service instance using the Address Manager.
 * Internally uses caching and remote resolution depending
 * on configuration.
 *
 * @param ServiceName - Service name to resolve.
 *
 * @returns {Promise<unknown>}
 *
 * @lifecycle
 * Can be called at any time after the Address Manager has been started.
 */
const findAService = AddressManager.findService


/**
 * Starts the Address Manager background processes.
 *
 * @description
 * Initializes internal mechanisms such as:
 * - Service registration
 * - Heartbeat / TTL refresh
 * - Token refresh
 *
 * This function does not start an HTTP server by itself.
 *
 * @returns {void}
 *
 * @lifecycle
 * Must be called once during application bootstrap,
 * before using service discovery features.
 */
const bootstrapAddressManager = AddressManager.start

export { AddressManagerRoutes, findAService, bootstrapAddressManager }