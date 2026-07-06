import fs from "node:fs/promises";
import type https from "node:https";
import path from "node:path";
import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import { CaClient } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import type { TlsBootstrapOptions } from "@trading-model/common/server/bootstrap";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import type { HttpServer } from "@trading-model/common/server/server-factory";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { Application } from "express";

import { CertificateClient } from "./certificate-client";

export interface BootstrapConfig {
	caUrl: string;
	serviceId: string;
	commonName: string;
	san: string[];
	certPath: string;
	keyPath: string;
	caPath: string;
	bootstrapToken?: string;
	tls?: TlsPaths;
}

export function bootstrapConfigFromEnv(
	env: Record<string, string | undefined>,
): BootstrapConfig | null {
	const caUrl = env.CERT_CLIENT_CA_URL;
	if (!caUrl) {
		return null;
	}
	return {
		caUrl,
		serviceId: env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown",
		commonName: env.CERT_CLIENT_COMMON_NAME ?? env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown",
		san: env.CERT_CLIENT_SANS?.split(",").map((entry) => entry.trim()) ?? [env.CERT_CLIENT_SERVICE_ID ?? env.APP_NAME ?? "unknown"],
		certPath: env.TLS_CERT_PATH ?? "/etc/tls/cert.pem",
		keyPath: env.TLS_KEY_PATH ?? "/etc/tls/key.pem",
		caPath: env.TLS_CA_PATH ?? "/etc/tls/ca.pem",
		bootstrapToken: env.CERT_CLIENT_BOOTSTRAP_TOKEN,
		tls: _buildClientTls(env),
	};
}

function _buildClientTls(
	env: Record<string, string | undefined>,
): BootstrapConfig["tls"] {
	if (!env.CA_CLIENT_TLS_KEY) {
		return undefined;
	}
	return {
		keyPath: env.CA_CLIENT_TLS_KEY,
		certPath: env.CA_CLIENT_TLS_CERT ?? "",
		caPath: env.CA_CLIENT_TLS_CA ?? "",
	};
}

export async function bootstrapFromEnv(
	env: Record<string, string | undefined>
): Promise<TlsPaths | null> {
	const config = bootstrapConfigFromEnv(env);
	if (!config) {
		return null;
	}
	return await bootstrapCertificate(config);
}

export async function bootstrapCertificate(
	config: BootstrapConfig
): Promise<TlsPaths> {
	const existing = await _tryLoadExistingCert(config);
	if (existing) {
		return existing;
	}

	const { keyPair, csr } = await _generateKeyAndCsr(config);
	const response = await _signWithCa(config, csr);
	await _writeCertFiles(config, keyPair.privateKey, response);

	return { keyPath: config.keyPath, certPath: config.certPath, caPath: config.caPath };
}

async function _tryLoadExistingCert(
	config: BootstrapConfig,
): Promise<TlsPaths | null> {
	try {
		await fs.access(config.certPath);
		await fs.access(config.keyPath);
		logger.info("TLS certificate already exists — skipping bootstrap", {
			certPath: config.certPath,
		});
		return { keyPath: config.keyPath, certPath: config.certPath, caPath: config.caPath };
	} catch (err) {
		logger.warn("TLS certificate files not found — proceeding with bootstrap", {
			err: normalizeError(err),
		});
		return null;
	}
}

async function _generateKeyAndCsr(config: BootstrapConfig): Promise<{
	keyPair: import("@trading-model/certificate-utils/generate-key-pair").KeyPair;
	csr: string;
}> {
	logger.info("Obtaining TLS certificate from CA", {
		serviceId: config.serviceId,
		caUrl: config.caUrl,
	});
	const keyPair = await generateKeyPairAsync(KeyAlgorithm.ecP384);
	const csr = await createCsrAsync({
		commonName: config.commonName,
		san: config.san,
		keyPem: keyPair.privateKey,
	});
	return { keyPair, csr };
}

async function _signWithCa(
	config: BootstrapConfig,
	csr: string,
): Promise<import("@trading-model/common/ca/ca-client").SignCertificateResponse> {
	const caClient = new CaClient({ baseUrl: config.caUrl, tls: config.tls });
	return await caClient.signCertificate(config.serviceId, csr, {
		bootstrapToken: config.bootstrapToken,
	});
}

async function _writeCertFiles(
	config: BootstrapConfig,
	privateKey: string,
	response: import("@trading-model/common/ca/ca-client").SignCertificateResponse,
): Promise<void> {
	const certDir = path.dirname(config.certPath);
	await fs.mkdir(certDir, { recursive: true });
	await _writeCertFile(config.keyPath, privateKey, 0o600);
	await _writeCertFile(config.certPath, response.cert, 0o644);
	await _writeCertFile(config.caPath, response.caPem, 0o644);
	_logCertWritten(config, response);
}

async function _writeCertFile(filePath: string, content: string, mode: number): Promise<void> {
	await fs.writeFile(filePath, content, { mode });
}

function _logCertWritten(
	config: BootstrapConfig,
	response: import("@trading-model/common/ca/ca-client").SignCertificateResponse,
): void {
	logger.info("TLS certificate obtained and written to disk", {
		serviceId: config.serviceId,
		certPath: config.certPath,
		serialNumber: response.serialNumber,
		expiresAt: response.expiresAt,
	});
}

export interface CreateHttpsServerOptions {
	port: number;
	tls: TlsPaths;
	routes: (app: Application) => void;
	rateLimit?: import("@trading-model/common/server/configure-app").RateLimitConfig;
	trustProxy?: boolean;
	watchTls?: boolean;
	env?: Record<string, string | undefined>;
	onServerReady?: (raw: import("node:https").Server) => void;
}

/**
 * Builds a {@link TlsBootstrapOptions} for use with {@link createBootstrap}.
 *
 * - `ensure()`: bootsraps TLS certificates from the CA if they do not
 *   already exist on disk (idempotent: skips if cert/key are present).
 * - `setupAutoRenew(server)`: creates a {@link CertificateClient} that
 *   periodically renews the certificate before expiry and hot-reloads
 *   the server TLS context via `server.setSecureContext()`.
 *
 * Returns `null` when `CERT_CLIENT_CA_URL` is not set (static TLS).
 */
function _setupAutoRenewCallback(
	server: https.Server,
	cert: { keyPem: string; certPem: string; caPem: string },
): void {
	try {
		server.setSecureContext({ key: cert.keyPem, cert: cert.certPem, ca: cert.caPem });
		logger.info("TLS context hot-reloaded after certificate renewal");
	} catch (err) {
		logger.error("Failed to hot-reload TLS context", { err });
	}
}

export function createTlsBootstrap(
	env: Record<string, string | undefined>,
): TlsBootstrapOptions | null {
	const config = bootstrapConfigFromEnv(env);
	if (!config) {
		return null;
	}
	return {
		ensure: () => bootstrapCertificate(config),
		setupAutoRenew: (server: https.Server) => {
			const client = new CertificateClient({ ...config, onRenew: (cert) => _setupAutoRenewCallback(server, cert) });
			setTimeout(() => client.startAutoRenew(), 1000);
		},
	};
}

async function loadServerDependencies(): Promise<{
	configureApp: (opts: { rateLimit?: { windowMs: number; limit: number }; trustProxy?: boolean }) => import("express").Application;
	mtlsAuthMiddleware: import("express").RequestHandler;
	responseProtocol: import("express").RequestHandler;
	createAndStartHttpsServer: (app: import("express").Application, opts: { port: number; tls: TlsPaths; watchTls: boolean }) => Promise<HttpServer>;
}> {
	const [configureAppMod, mtlsAuthMod, responseProtocolMod, serverFactoryMod] = await Promise.all([
		import("@trading-model/common/server/configure-app"),
		import("@trading-model/common/middleware/mtls-auth"),
		import("@trading-model/common/middleware/response-protocol"),
		import("@trading-model/common/server/server-factory"),
	]);
	return {
		configureApp: configureAppMod.configureApp,
		mtlsAuthMiddleware: mtlsAuthMod.MTLSAuthMiddleware,
		responseProtocol: responseProtocolMod.ResponseProtocol,
		createAndStartHttpsServer: serverFactoryMod.createAndStartHttpsServer,
	};
}

function setupAutoRenew(server: HttpServer, config: BootstrapConfig): void {
	const client = new CertificateClient({
		...config,
		onRenew: (cert) => server.raw.setSecureContext({ key: cert.keyPem, cert: cert.certPem, ca: cert.caPem }),
	});
	setTimeout(() => client.startAutoRenew(), 1000);
}

async function _createServerApp(options: CreateHttpsServerOptions, tls: TlsPaths): Promise<HttpServer> {
	const { configureApp, mtlsAuthMiddleware, responseProtocol, createAndStartHttpsServer } =
		await loadServerDependencies();
	const app = configureApp({ rateLimit: options.rateLimit, trustProxy: options.trustProxy });
	app.use(mtlsAuthMiddleware);
	options.routes(app);
	app.use(responseProtocol);
	const server = await createAndStartHttpsServer(app, { port: options.port, tls, watchTls: options.watchTls ?? true });
	options.onServerReady?.(server.raw);
	return server;
}

export async function createHttpsServer(options: CreateHttpsServerOptions): Promise<HttpServer> {
	const env = options.env ?? {};
	const tls = (await bootstrapFromEnv(env)) ?? options.tls;
	const server = await _createServerApp(options, tls);
	const config = bootstrapConfigFromEnv(env);
	if (config) {
		setupAutoRenew(server, config);
	}
	return server;
}
