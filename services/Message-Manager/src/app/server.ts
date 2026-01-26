/**
 * @file server.ts
 * 
 * @description
 * This module is responsible for creating and managing the HTTPS Express server
 * with mandatory mutual TLS (mTLS) authentications.
 * 
 * It configures:
 * - Core Express application
 * - Security middlewares (helmet, rate limiting)
 * - Request parsing
 * - mTLS authentication enforcement
 * - Global response and error protocol handling
 * - HTTPS server with strict TLS configuration
 * - Graceful shutdown lifecycle
 * 
 * This server is intended to be used as an internal service endpoint 
 * within a secured, service-to-service architecture.
 * 
 * @responsability
 * - Expose a secured HTTPS API
 * - Enforce client authentication using mTLS
 * - Protect the service against common web vulnerabilities
 * - Apply global request/response standards
 * - Manage server lifecycle (shutdown / startup)
 * 
 * @restrictions
 * - HTTP (unencrypted traffic is not supported)
 * - Client certificates are mandatory (requestCert=true)
 * - Only TLS v1.3 is allowed
 * - Certificates must be provided via filesystem paths
 * - This server is not designed for browser-facing traffic
 * 
 * @architecture
 * This module acts as an infrastructure-layer component and must not
 * contain business logic. Routes and domain logic must be defined elsewhere
 * 
 * @security
 * - Mutual TLS is enforced at the transport layer
 * - Rate limiting is applied globally
 * - Security headers are enabled via Helmet
 * - Unauthorized clients are rejected during the TLS handshake
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.24
 */

import { ResponseProtocole } from "cash-lib/middleware/responseProtocole";
import { MTLSAuthMiddleware } from "cash-lib/middleware/MTLSAuth";
import { AddressManagerRoutes } from "config/address-manager";
import { logger } from 'cash-lib/config/logger';
import { rateLimit } from "express-rate-limit";
import express, { Router } from "express";
import { env } from 'config/env';
import https from 'node:https';
import path from 'node:path';
import helmet from "helmet";
import fs from 'node:fs';

/**
 * Creates and starts an HTTPS Express server secured with mutual TLS.
 * 
 * @function createServer
 * 
 * @description
 * This function initializes the Express application, applies all required 
 * middlewares in the correct order, binds routes and starts and HTTPS server
 * configured for strict mTLS authentication.
 * 
 * The server starts listening immediately on the configured port.
 * 
 * @returns {{close: () => Promise<void>}}
 * An object exposing a `close` method for graceful shutdown.
 * 
 * @throws {Error}
 * Throws if:
 * - TLS certificate files cannot be read
 * - The HTTPS server fails to start
 * 
 * @lifecycle
 * Intended to be called once during application bootstrap.
 * 
 * @example
 * ```ts
 * const server = createServer();
 * 
 * process.on("SIGTERM", async () => {
 *  await server.close();
 * })
 * ```
 */
export function createServer(): {close: () => Promise<void>} {
    const app = express()

    /**
     * ─────────────────────────────────────────────────────────────
     * Middlewares – order matters
     * ─────────────────────────────────────────────────────────────
     */

    /**
     * Adds security-related HTTP headers.
     */
    app.use(helmet());

    /**
     * Enables trust for reverse proxies (required for correct IP resolution).
     */
    app.set('trust proxy', true)

    /**
     * Request body parsing with strict size limits.
     */
    app.use(express.json({ limit: '1mb' }))
    app.use(express.urlencoded({ extended: false }))

    /**
     * Global rate limiting to protect against brute-force
     * and denial-of-service attacks.
     */
    const limiter = rateLimit({
        windowMs: 15 * 6,
        limit: 1,
        message: "Too many requests from this IP, please try again later.",
    });

    app.use(limiter);

    /**
     * Mutual TLS authentication middleware.
     * 
     * - Requires a valid client certificate
     * - Certificate validity is ensured by the TLS handshake
     * - Populates request identity metadata (req.clientIdentity)
     */
    app.use(MTLSAuthMiddleware);
    app.use(AddressManagerRoutes);

    /**
     * ─────────────────────────────────────────────────────────────
     * Technical endpoints
     * ─────────────────────────────────────────────────────────────
     */

    const apiRoutes: [string, Router][] = [

    ];

    apiRoutes.forEach(([path, router]) => app.use(path, router));

    /**
     * ─────────────────────────────────────────────────────────────
     * Global response & error handling
     * ─────────────────────────────────────────────────────────────
     */
    app.use(ResponseProtocole);

    /**
     * ─────────────────────────────────────────────────────────────
     * HTTPS server with strict mTLS configuration
     * ─────────────────────────────────────────────────────────────
     */
    const httpsServer = https.createServer(
        {
            key: fs.readFileSync(path.resolve(env.TLS_KEY_PATH)),
            cert: fs.readFileSync(path.resolve(env.TLS_CERT_PATH)),
            ca: fs.readFileSync(path.resolve(env.TLS_CA_PATH)),
            requestCert: true,
            rejectUnauthorized: true,
            minVersion: 'TLSv1.3'
        },
        app
    )

    httpsServer.listen(env.PORT, () => {
        logger.info(
            'HTTPS server listening',
            {
                port: env.PORT,
                mtls: true
            }
        )
    })

    /**
     * Graceful shutdown
     */
    return {
        close: () =>
            new Promise<void>(async (resolve, reject) => {
                try{
                    httpsServer.close();
                    resolve();
                }catch(e){
                    reject(e);
                }
            })
    }
}