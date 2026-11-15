import type { TlsPaths } from "@trading-model/common/config/tls-paths";
import { MTLSAuthMiddleware } from "@trading-model/http/mtls-auth";
import { MTLSAuthorizationMiddleware } from "@trading-model/http/mtls-authorization";
import { ResponseProtocol } from "@trading-model/http/response-protocol";
import type { ServiceId } from "@trading-model/primitives/primitives";
import type { Application, RequestHandler } from "express";
import { configureApp } from "./configure-app";
import type { ReadinessCheck } from "./readiness";
import {
	createAndStartHttpsServer,
	type HttpServer,
	type HttpsServer,
	type HttpsServerOptions,
} from "./server-factory";

export { buildTlsFromEnv } from "@trading-model/common/config/tls-paths";
export type { HttpServer, HttpsServer, TlsPaths };

/** Enables caller authorization (ACL, ADR-0011) on a secure server; omit it to disable. */
export interface AuthorizationOptions {
	/** The service this server enforces authorization on behalf of. */
	targetService: ServiceId;
}

/** Options for creating an mTLS-secured HTTPS server. */
export interface SecureServerOptions extends HttpsServerOptions {
	routes: (app: Application) => void;
	trustProxy?: boolean;
	authorize?: AuthorizationOptions;
	readiness?: ReadinessCheck[];
	/**
	 * Public API majors the routes serve under `/v<major>` (ADR-0072), besides
	 * the bare paths service-to-service callers use. Another `/v<n>` answers 404.
	 */
	apiVersions?: readonly number[];
}

/**
 * Serves a listed `/v<major>/...` on the routes without its prefix, answers
 * 404 to an unlisted major.
 */
export function apiVersionPrefix(majors: readonly number[]): RequestHandler {
	return (req, res, next) => {
		const match = /^\/v(\d+)(?=[/?]|$)/.exec(req.url);
		if (!match) {
			next();
			return;
		}
		if (!majors.includes(Number(match[1]))) {
			res.status(404).json({ error: `API version v${match[1]} not served` });
			return;
		}
		const rest = req.url.slice(match[0].length);
		req.url = rest.startsWith("/") ? rest : `/${rest}`;
		next();
	};
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
): Promise<HttpsServer> {
	const app = configureApp({
		trustProxy: options.trustProxy,
		readiness: options.readiness,
	});

	app.use(MTLSAuthMiddleware);

	if (options.authorize) {
		app.use(MTLSAuthorizationMiddleware(options.authorize.targetService));
	}

	if (options.apiVersions) {
		app.use(apiVersionPrefix(options.apiVersions));
	}
	options.routes(app);

	app.use(ResponseProtocol);

	return await createAndStartHttpsServer(app, {
		port: options.port,
		tls: options.tls,
	});
}
