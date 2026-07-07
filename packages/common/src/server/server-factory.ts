import https from "node:https";

import type { Application } from "express";
import { logger } from "../config/logger";
import type { Port } from "../domain/primitives";
import type { TlsPaths } from "../domain/tls-paths";
import { loadTlsFiles } from "./tls-loader";
import { setupTlsWatcher } from "./tls-watcher";

export interface HttpsServerOptions {
	port: Port;
	tls: TlsPaths;
	watchTls?: boolean;
}

export interface HttpServer {
	close: () => Promise<void>;
	raw: https.Server;
}

export async function createAndStartHttpsServer(
	app: Application,
	options: HttpsServerOptions
): Promise<HttpServer> {
	const tlsContext = await loadTlsFiles(options.tls);

	const httpsServer = https.createServer(
		{
			key: tlsContext.key,
			cert: tlsContext.cert,
			ca: tlsContext.ca,
			requestCert: true,
			rejectUnauthorized: true,
			minVersion: "TLSv1.3",
		},
		app
	);

	httpsServer.listen(options.port, () => {
		logger.info("HTTPS server listening", {
			context: { port: options.port, mtls: true },
		});
	});

	if (options.watchTls) {
		setupTlsWatcher(httpsServer, options.tls).catch((err) => {
			logger.error("Failed to start TLS watcher", { context: { err } });
		});
	}

	return {
		raw: httpsServer,
		close: () =>
			new Promise<void>((resolve, reject) => {
				httpsServer.close((err) => {
					if (err) reject(err);
					else resolve();
				});
			}),
	};
}

export { setupTlsWatcher } from "./tls-watcher";
