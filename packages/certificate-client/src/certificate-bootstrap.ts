import type https from "node:https";
import { logger } from "@trading-model/common/config/logger";
import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/domain/tls-paths";
import type { TlsBootstrapOptions } from "@trading-model/common/server/bootstrap";
import type { SecureServerOptions } from "@trading-model/common/server/create-secure-server";
import type {
	HttpServer,
	HttpsServerOptions,
} from "@trading-model/common/server/server-factory";
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
		server.setSecureContext(cert);
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
						key: cert.keyPem,
						cert: cert.certPem,
						ca: cert.caPem,
					}),
			});
			_startAutoRenew(client);
		},
	};
}

function _startAutoRenew(client: CertificateClient): void {
	void client.obtainCertificate().then((holder) => {
		setTimeout(() => holder.startAutoRenew(), 1000);
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

async function loadServerDependencies(): Promise<{
	configureApp: (opts: {
		rateLimit?: import("@trading-model/common/server/configure-app").RateLimitConfig;
		trustProxy?: boolean;
	}) => import("express").Application;
	mtlsAuthMiddleware: import("express").RequestHandler;
	responseProtocol: import("express").RequestHandler;
	createAndStartHttpsServer: (
		app: import("express").Application,
		opts: HttpsServerOptions
	) => Promise<HttpServer>;
}> {
	const [configureAppMod, mtlsAuthMod, responseProtocolMod, serverFactoryMod] =
		await Promise.all([
			import("@trading-model/common/server/configure-app"),
			import("@trading-model/common/middleware/mtls-auth"),
			import("@trading-model/common/middleware/response-protocol"),
			import("@trading-model/common/server/server-factory"),
		]);
	return {
		configureApp: configureAppMod.configureApp,
		mtlsAuthMiddleware: mtlsAuthMod.MTLSAuthMiddleware,
		responseProtocol: responseProtocolMod.ResponseProtocol as unknown as import("express").RequestHandler,
		createAndStartHttpsServer: serverFactoryMod.createAndStartHttpsServer,
	};
}

function setupAutoRenew(server: HttpServer, config: BootstrapConfig): void {
	const client = new CertificateClient({
		...config,
		serviceId:
			config.serviceId as unknown as import("@trading-model/common/domain/primitives").ServiceId,
		onRenew: (cert) =>
			server.raw.setSecureContext({
				key: cert.keyPem,
				cert: cert.certPem,
				ca: cert.caPem,
			}),
	});
	_startAutoRenew(client);
}

async function _createServerApp(
	options: CreateHttpsServerOptions,
	tls: TlsPaths
): Promise<HttpServer> {
	const {
		configureApp,
		mtlsAuthMiddleware,
		responseProtocol,
		createAndStartHttpsServer,
	} = await loadServerDependencies();
	const app = configureApp({
		rateLimit: options.rateLimit,
		trustProxy: options.trustProxy,
	});
	app.use(mtlsAuthMiddleware);
	options.routes(app);
	app.use(responseProtocol);
	const server = await createAndStartHttpsServer(app, {
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
