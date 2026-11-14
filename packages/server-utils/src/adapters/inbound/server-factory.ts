import type { ServerOptions } from "node:https";
import https from "node:https";
import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/config/tls-paths";
import { toSecureContextOptions } from "@trading-model/common/config/tls-paths";
import { loadTlsPemBundle } from "@trading-model/http/infrastructure/http-tls-loader";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { Port } from "@trading-model/primitives/primitives";
import type { Application } from "express";
import { setupTlsWatcher } from "../../infrastructure/tls-watcher";
import type { HttpServer } from "../../shared/server-types";

export interface HttpsServerOptions {
	port: Port;
	tls: TlsPaths;
}

/** The running HTTPS server. */
export type HttpsServer = HttpServer;

export type { HttpServer };

function _buildServerOptions(tls: TlsPemBundle): ServerOptions {
	return {
		...toSecureContextOptions(tls),
		requestCert: true,
		rejectUnauthorized: true,
		minVersion: "TLSv1.3",
	};
}

function _startListening(server: https.Server, port: Port): void {
	server.listen(port, () => {
		logger.info("HTTPS server listening", {
			context: { port, mtls: true },
		});
	});
}

function _watchTlsAsync(server: https.Server, tls: TlsPaths): void {
	setupTlsWatcher(server, tls).catch((err) => {
		logger.error("Failed to start TLS watcher", { context: { err } });
	});
}

function _createCloseHandle(server: https.Server): () => Promise<void> {
	return () =>
		new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			});
		});
}

export async function createAndStartHttpsServer(
	app: Application,
	options: HttpsServerOptions
): Promise<HttpsServer> {
	const tlsContext = await loadTlsPemBundle(options.tls);
	const httpsServer = https.createServer(_buildServerOptions(tlsContext), app);

	_startListening(httpsServer, options.port);

	_watchTlsAsync(httpsServer, options.tls);

	return { close: _createCloseHandle(httpsServer) };
}
