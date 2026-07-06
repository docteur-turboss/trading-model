import fs from "node:fs";
import fsPromises from "node:fs/promises";
import https from "node:https";
import path from "node:path";

import type { Application } from "express";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import type { TlsConfig } from "./load-tls-config";

export interface HttpsServerOptions {
	port: number;
	tls: TlsConfig;
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
	const [key, cert, ca] = await Promise.all([
		fsPromises.readFile(path.resolve(options.tls.key), "utf8"),
		fsPromises.readFile(path.resolve(options.tls.cert), "utf8"),
		fsPromises.readFile(path.resolve(options.tls.ca), "utf8"),
	]);

	const httpsServer = https.createServer(
		{
			key,
			cert,
			ca,
			requestCert: true,
			rejectUnauthorized: true,
			minVersion: "TLSv1.3",
		},
		app
	);

	httpsServer.listen(options.port, () => {
		logger.info("HTTPS server listening", {
			context: {
				port: options.port,
				mtls: true,
			},
		});
	});

	if (options.watchTls) {
		/* istanbul ignore next -- dead code: setupTlsWatcher never rejects; all errors handled internally */
		setupTlsWatcher(httpsServer, options.tls).catch((err) => {
			logger.error("Failed to start TLS watcher", { context: { err } });
		});
	}

	return {
		raw: httpsServer,
		close: () =>
			new Promise<void>((resolve, reject) => {
				httpsServer.close((err) => {
					if (err) {
						reject(err);
					} else {
						resolve();
					}
				});
			}),
	};
}

/**
 * Watches the TLS certificate directories for file changes and reloads
 * the server's secure context without restarting the process.
 *
 * Uses fs.watch which is platform-native but may be unreliable on some
 * systems (notably Windows and macOS under heavy I/O). A 300 ms debounce
 * prevents multiple rapid reloads from batch writes.
 */
async function reloadTlsContext(
	server: https.Server,
	tls: TlsConfig,
	eventType: string,
	filename: string | null
): Promise<void> {
	if (eventType !== "change") {
		return;
	}

	try {
		const [key, cert, ca] = await Promise.all([
			fsPromises.readFile(path.resolve(tls.key), "utf8"),
			fsPromises.readFile(path.resolve(tls.cert), "utf8"),
			fsPromises.readFile(path.resolve(tls.ca), "utf8"),
		]);

		server.setSecureContext({ key, cert, ca });
		logger.info("TLS context reloaded", { context: { event: eventType, file: filename } });
	} catch (err) {
		logger.error("Failed to reload TLS context", { context: { err } });
	}
}

function createDebouncedReload(
	server: https.Server,
	tls: TlsConfig
): (eventType: string, filename: string | null) => void {
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	return (eventType: string, filename: string | null): void => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
		debounceTimer = setTimeout(() => {
			void reloadTlsContext(server, tls, eventType, filename);
		}, 300);
	};
}

export async function setupTlsWatcher(
	server: https.Server,
	tls: TlsConfig
): Promise<void> {
	const files = [tls.key, tls.cert, tls.ca];
	const dirs = new Set(files.map((file) => path.dirname(path.resolve(file))));
	const debouncedReload = createDebouncedReload(server, tls);

	await Promise.all(
		[...dirs].map(async (dir) => {
			try {
				await fsPromises.access(dir, fs.constants.R_OK);
				const watcher = fs.watch(dir, debouncedReload);
				watcher.unref();
			} catch (err) {
				logger.warn("Cannot watch TLS directory", {
					context: {
						dir,
						err: normalizeError(err),
					},
				});
			}
		})
	);
}
