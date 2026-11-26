import http from "node:http";
import https from "node:https";
import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import {
	buildTlsFromEnv,
	toSecureContextOptions,
} from "@trading-model/common/config/tls-paths";
import { Port, type ServiceId } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { configureApp, createHealthApp } from "./configure-app";
import { loadTlsPemBundle } from "./http-tls-loader";
import { logger } from "./logger";
import { MTLSAuthMiddleware } from "./mtls-auth";
import { MTLSAuthorizationMiddleware } from "./mtls-authorization";
import type { ReadinessCheck } from "./readiness";
import { ResponseProtocol } from "./response-protocol";
import type { HttpServer } from "./shared/server-types";
import { setupTlsWatcher } from "./tls-watcher";

export type { HttpServer };

/**
 * Plain-HTTP port of the kubelet probes (`/ping`, `/health/ready`): no
 * NetworkPolicy opens it to pods, the mTLS port stays strict (ADR-0091).
 */
export const HEALTH_PORT = Port.of(3001);

export interface ServiceServerOptions {
	env: TlsEnvVars & { PORT: number };
	/** Canonical SPIFFE service identity used as the ACL target for inbound authorization (ADR-0011). */
	serviceId: ServiceId;
	routes: (app: Application) => void;
	trustProxy?: boolean;
	readiness?: ReadinessCheck[];
}

/**
 * Creates and starts the mTLS HTTPS server of a service (TLSv1.3, client certificate required)
 * and the plain-HTTP probe listener on {@link HEALTH_PORT}.
 * Middleware order: Helmet (configureApp) → mTLS → caller ACL → routes → ResponseProtocol.
 * No rate limiter: callers are mTLS-authenticated services, the gateway limits external clients.
 */
export async function createServiceServer(
	options: ServiceServerOptions
): Promise<HttpServer> {
	const tls = buildTlsFromEnv(options.env);
	const port = Port.of(options.env.PORT);
	const app = configureApp({
		trustProxy: options.trustProxy,
		readiness: options.readiness,
	});
	app.use(MTLSAuthMiddleware);
	app.use(MTLSAuthorizationMiddleware(options.serviceId));
	options.routes(app);
	app.use(ResponseProtocol);

	const server = https.createServer(
		{
			...toSecureContextOptions(await loadTlsPemBundle(tls)),
			requestCert: true,
			rejectUnauthorized: true,
			minVersion: "TLSv1.3",
		},
		app
	);
	server.listen(port, () => {
		logger.info("HTTPS server listening", { context: { port, mtls: true } });
	});
	const healthServer = http.createServer(createHealthApp(options.readiness));
	healthServer.listen(HEALTH_PORT, () => {
		logger.info("Health probe server listening", {
			context: { port: HEALTH_PORT, mtls: false },
		});
	});
	setupTlsWatcher(server, tls).catch((err) => {
		logger.error("Failed to start TLS watcher", { context: { err } });
	});

	const closeServer = (listener: http.Server) =>
		new Promise<void>((resolve, reject) => {
			listener.close((err) => (err ? reject(err) : resolve()));
		});
	return {
		close: async () => {
			await Promise.all([closeServer(server), closeServer(healthServer)]);
		},
	};
}
