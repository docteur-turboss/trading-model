import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import {
	type TlsPaths,
	type TlsPemBundle,
	toSecureContextOptions,
} from "@trading-model/common/domain/tls-paths";
import type { TlsBootstrapOptions } from "@trading-model/server-utils/server/bootstrap";
import type { SecureServerOptions } from "@trading-model/server-utils/server/create-secure-server";
import type {
	HttpServer,
	HttpsServerOptions,
} from "@trading-model/server-utils/server/server-factory";
import type { BootstrapConfig } from "./certificate-bootstrap-config";
import { bootstrapConfigFromEnv } from "./certificate-bootstrap-config";
import {
	bootstrapCertificate,
	bootstrapFromEnv,
} from "./certificate-bootstrapper";
import { CertificateClient } from "./certificate-client";

export type { BootstrapConfig } from "./certificate-bootstrap-config";
export { bootstrapConfigFromEnv } from "./certificate-bootstrap-config";
export {
	bootstrapCertificate,
	bootstrapFromEnv,
} from "./certificate-bootstrapper";

export interface CreateHttpsServerOptions extends SecureServerOptions {
	env?: Record<string, string | undefined>;
	onServerReady?: (raw: https.Server) => void;
}

function _setupAutoRenewCallback(
	server: https.Server,
	cert: TlsPemBundle
): void {
	try {
		server.setSecureContext(toSecureContextOptions(cert));
		logger.info("TLS context hot-reloaded after certificate renewal");
	} catch (err) {
		logger.error("Failed to hot-reload TLS context", { err });
	}
}

function _createTlsBootstrap(config: BootstrapConfig): TlsBootstrapOptions {
	return {
		ensure: () => bootstrapCertificate(config).then(() => {}),
		setupAutoRenew: (server: https.Server) => {
			const client = new CertificateClient({
				...config,
				serviceId:
					config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
				onRenew: (cert) =>
					_setupAutoRenewCallback(server, {
						keyPem:
							cert.keyPem as unknown as import("@trading-model/common/domain/primitives").KeyPem,
						certPem: cert.certPem,
						caPem: cert.caPem,
					}),
			});
			_startAutoRenew(client);
		},
	};
}

function _startAutoRenew(client: CertificateClient): void {
	void client.obtainCertificate().then((holder) => {
		setTimeout(() => holder.startAutoRenew(), 1000).unref();
	});
}

export function createTlsBootstrap(
	env: Record<string, string | undefined>
): TlsBootstrapOptions | null {
	const config = bootstrapConfigFromEnv(env);
	if (!config) {
		return null;
	}
	return _createTlsBootstrap(config);
}

interface ServerDeps {
	configureApp: (opts: {
		rateLimit?: import("@trading-model/server-utils/server/configure-app").RateLimitConfig;
		trustProxy?: boolean;
	}) => import("express").Application;
	mtlsAuthMiddleware: import("express").RequestHandler;
	responseProtocol: import("express").RequestHandler;
	createAndStartHttpsServer: (
		app: import("express").Application,
		opts: HttpsServerOptions
	) => Promise<HttpServer>;
}

function _extractServerDeps(
	modules: [
		typeof import("@trading-model/server-utils/server/configure-app"),
		typeof import("@trading-model/common/middleware/mtls-auth"),
		typeof import("@trading-model/common/middleware/response-protocol"),
		typeof import("@trading-model/server-utils/server/server-factory"),
	]
): ServerDeps {
	return {
		configureApp: modules[0].configureApp,
		mtlsAuthMiddleware: modules[1].MTLSAuthMiddleware,
		responseProtocol: modules[2]
			.ResponseProtocol as unknown as import("express").RequestHandler,
		createAndStartHttpsServer: modules[3].createAndStartHttpsServer,
	};
}

async function loadServerDependencies(): Promise<ServerDeps> {
	const modules = await Promise.all([
		import("@trading-model/server-utils/server/configure-app"),
		import("@trading-model/common/middleware/mtls-auth"),
		import("@trading-model/common/middleware/response-protocol"),
		import("@trading-model/server-utils/server/server-factory"),
	]);
	return _extractServerDeps(modules);
}

function _renewContext(server: HttpServer, cert: TlsPemBundle): void {
	server.raw.setSecureContext(toSecureContextOptions(cert));
}

function setupAutoRenew(server: HttpServer, config: BootstrapConfig): void {
	const client = new CertificateClient({
		...config,
		serviceId:
			config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
		onRenew: (cert) => _renewContext(server, cert),
	});
	_startAutoRenew(client);
}

function _configureAppWithMiddleware(
	configureApp: ServerDeps["configureApp"],
	mtlsAuthMiddleware: ServerDeps["mtlsAuthMiddleware"],
	responseProtocol: ServerDeps["responseProtocol"],
	options: CreateHttpsServerOptions
): import("express").Application {
	const app = configureApp({
		rateLimit: options.rateLimit,
		trustProxy: options.trustProxy,
	});
	app.use(mtlsAuthMiddleware);
	options.routes(app);
	app.use(responseProtocol);
	return app;
}

async function _createServerApp(
	options: CreateHttpsServerOptions,
	tls: TlsPaths
): Promise<HttpServer> {
	const deps = await loadServerDependencies();
	const app = _configureAppWithMiddleware(
		deps.configureApp,
		deps.mtlsAuthMiddleware,
		deps.responseProtocol,
		options
	);
	const server = await deps.createAndStartHttpsServer(app, {
		port: options.port,
		tls,
		watchTls: options.watchTls ?? true,
	});
	options.onServerReady?.(server.raw);
	return server;
}

export async function createHttpsServer(
	options: CreateHttpsServerOptions
): Promise<HttpServer> {
	const env = options.env ?? {};
	const tls = (await bootstrapFromEnv(env)) ?? options.tls;
	const server = await _createServerApp(options, tls);
	const config = bootstrapConfigFromEnv(env);
	if (config) {
		setupAutoRenew(server, config);
	}
	return server;
}
