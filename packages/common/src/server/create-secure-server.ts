import type { Application } from "express";
import type { Port } from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { MTLSAuthMiddleware } from "../middleware/mtls-auth";
import { ResponseProtocol } from "../middleware/response-protocol";
import { configureApp, RateLimitConfig } from "./configure-app";
import { createAndStartHttpsServer, HttpServer } from "./server-factory";

export { buildTlsFromEnv } from "../domain/tls-paths";
export type { TlsPaths };
export { HttpServer, RateLimitConfig };

/** Options for creating an mTLS-secured HTTPS server. */
export interface SecureServerOptions {
	port: Port;
	tls: TlsPaths;
	routes: (app: Application) => void;
	rateLimit?: RateLimitConfig;
	trustProxy?: boolean;
	watchTls?: boolean;
}

/**
 * Creates and starts an HTTPS server with mTLS, rate-limiting, and Helmet security.
 * Composes the Express app from focused sub-modules:
 *   - configureApp     — Helmet, trust proxy, body parsers, rate limiter, ping route
 *   - MTLSAuthMiddleware — mTLS client certificate validation
 *   - ResponseProtocol  — Global error normalisation middleware
 *   - createAndStartHttpsServer — HTTPS listener with mTLS (TLSv1.3)
 */
export async function createSecureServer(
	options: SecureServerOptions
): Promise<HttpServer> {
	const app = configureApp({
		rateLimit: options.rateLimit,
		trustProxy: options.trustProxy,
	});

	app.use(MTLSAuthMiddleware);

	options.routes(app);

	app.use(ResponseProtocol);

	return await createAndStartHttpsServer(app, {
		port: options.port,
		tls: options.tls,
		watchTls: options.watchTls ?? true,
	});
}
