import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { MTLSAuthMiddleware } from "@trading-model/common/middleware/mtls-auth";
import { MTLSAuthorizationMiddleware } from "@trading-model/common/middleware/mtls-authorization";
import { ResponseProtocol } from "@trading-model/common/middleware/response-protocol";
import type { Application } from "express";
import { configureApp, RateLimitConfig } from "./configure-app";
import {
	createAndStartHttpsServer,
	HttpServer,
	type HttpsServerOptions,
} from "./server-factory";

export { buildTlsFromEnv } from "@trading-model/common/domain/tls-paths";
export type { TlsPaths };
export { HttpServer, RateLimitConfig };

/** Options for enabling caller authorization (ACL) on a secure server. */
export interface AuthorizationOptions {
	/** The service this server enforces authorization on behalf of. */
	targetService: ServiceId;
	/** Explicit allowlist; falls back to {@link DEFAULT_ACL} when omitted. */
	allowedCallers?: ServiceId[];
	/**
	 * Defaults to `false`. Enable once workloads present attested SVIDs
	 * (ADR-0011) so the caller identity from the SPIFFE ID is enforceable.
	 */
	enabled?: boolean;
}

/** Options for creating an mTLS-secured HTTPS server. */
export interface SecureServerOptions extends HttpsServerOptions {
	routes: (app: Application) => void;
	rateLimit?: RateLimitConfig;
	trustProxy?: boolean;
	authorize?: AuthorizationOptions;
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

	if (options.authorize?.enabled) {
		app.use(
			MTLSAuthorizationMiddleware(
				options.authorize.targetService,
				options.authorize.allowedCallers
			)
		);
	}

	options.routes(app);

	app.use(ResponseProtocol);

	return await createAndStartHttpsServer(app, {
		port: options.port,
		tls: options.tls,
		watchTls: options.watchTls ?? true,
	});
}
