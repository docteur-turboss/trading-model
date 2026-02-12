import { ResponseProtocole } from "cash-lib/middleware/responseProtocole";
import { MTLSAuthMiddleware } from "cash-lib/middleware/MTLSAuth";
import { AddressManagerRoutes } from "config/address-manager";
// import { MessageManagerRoutes } from "config/message-manager";
import { logger } from 'cash-lib/config/logger';
import { rateLimit } from "express-rate-limit";
import { env } from 'config/env';
import https from 'node:https';
import express from "express";
import path from 'node:path';
import helmet from "helmet";
import fs from 'node:fs';

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
    app.set('trust proxy', true);

    /**
     * Request body parsing with strict size limits.
     */
    app.use(express.json({ limit: '1mb' }));
    app.use(express.urlencoded({ extended: false }));

    /**
     * Global rate limiting to protect against brute-force
     * and denial-of-service attacks.
     */
    const limiter = rateLimit({
        windowMs: 15 * 60 * 1000,
        limit: 100,
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

    /**
     * ─────────────────────────────────────────────────────────────
     * Technical endpoints
     * ─────────────────────────────────────────────────────────────
     */

    // const apiRoutes: [string, Router][] = [];
    // apiRoutes.forEach(([path, router]) => app.use(path, router));

    AddressManagerRoutes(app);
    // MessageManagerRoutes(app);

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