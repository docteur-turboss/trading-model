/**
 * @file message-manager.ts
 *
 * @description
 * Composition module for the Message Broker HTTP interface.
 *
 * This file instantiates a Broker client from the `messaging` package
 * using TLS configuration provided via environment variables, then
 * exposes its HTTP listener to be mounted by the application server.
 *
 * This module does not start the broker by itself and does not perform
 * any message processing logic.
 *
 * @responsability
 * - Instantiate the Broker with TLS configuration
 * - Expose the Broker HTTP listener
 * - Provide a single shared Broker instance for the process
 *
 * @restrictions
 * - Must not contain message handling or business logic
 * - Must not reconfigure the Broker after instantiation
 * - Must not start or stop the Broker lifecycle explicitly
 *
 * @architecture
 * Infrastructure / integration layer.
 * This module wires the messaging broker into the HTTP server.
 *
 * @author docteur-turboss
 *
 * @version 1.0.0
 *
 * @since 2026.01.28
 */

import broker from "messaging";
import { env } from "./env";

/**
 * Broker singleton instance.
 *
 * @description
 * Instantiated once at module load time using TLS configuration
 * provided by the runtime environment.
 *
 * This instance is shared across the entire application lifecycle.
 */
const Broker = new broker({
    CertificatPath: env.TLS_CERT_PATH,
    KeyCertificatPath: env.TLS_KEY_PATH,
    RootCACertPath: env.TLS_CA_PATH
})

/**
 * Message broker HTTP route binder.
 *
 * @description
 * Exposes HTTP endpoints required by the messaging broker.
 *
 * This function is intended to be mounted directly on an Express
 * (or compatible) application instance.
 *
 * @returns {void}
 *
 * @lifecycle
 * Must be registered during HTTP server initialization.
 */
const MessageManagerRoutes = Broker.listen

export { MessageManagerRoutes }