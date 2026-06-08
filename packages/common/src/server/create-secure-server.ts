import { Application } from 'express';

import { configureApp, RateLimitConfig } from './configure-app';
import { TlsConfig } from './load-tls-config';
import { createAndStartHttpsServer, HttpServer } from './server-factory';
import { MTLSAuthMiddleware } from '../middleware/mtls-auth';
import { ResponseProtocol } from '../middleware/response-protocol';

export { HttpServer, TlsConfig as TlsPaths, RateLimitConfig };

/** Options for creating an mTLS-secured HTTPS server. */
export interface SecureServerOptions {
  port: number;
  tls: TlsConfig;
  routes: (app: Application) => void;
  rateLimit?: RateLimitConfig;
  trustProxy?: boolean;
}

/**
 * Creates and starts an HTTPS server with mTLS, rate-limiting, and Helmet security.
 * Composes the Express app from focused sub-modules:
 *   - configureApp     — Helmet, trust proxy, body parsers, rate limiter, ping route
 *   - MTLSAuthMiddleware — mTLS client certificate validation
 *   - ResponseProtocol  — Global error normalisation middleware
 *   - createAndStartHttpsServer — HTTPS listener with mTLS (TLSv1.3)
 */
export async function createSecureServer(options: SecureServerOptions): Promise<HttpServer> {
  const app = configureApp({
    rateLimit: options.rateLimit,
    trustProxy: options.trustProxy,
  });

  app.use(MTLSAuthMiddleware);

  options.routes(app);

  app.use(ResponseProtocol);

  return await createAndStartHttpsServer(app, { port: options.port, tls: options.tls });
}
