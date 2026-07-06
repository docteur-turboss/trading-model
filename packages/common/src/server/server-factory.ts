import fs from "node:fs";
import fsPromises from "node:fs/promises";
import https from "node:https";
import path from "node:path";

import type { Application } from "express";
import { logger } from "../config/logger";
import type { TlsPaths } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";

export interface HttpsServerOptions {
	port: number;
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
	const tlsContext = await _loadTlsFiles(options.tls);
	const httpsServer = _createHttpsServer(app, tlsContext);
	_startListening(httpsServer, options.port);

	if (options.watchTls) {
		_startTlsWatcher(httpsServer, options.tls);
	}

	return {
		raw: httpsServer,
		close: _createCloseHandler(httpsServer),
	};
}

async function _loadTlsFiles(
	tls: TlsPaths
): Promise<{ key: string; cert: string; ca: string }> {
	const [key, cert, ca] = await Promise.all([
		fsPromises.readFile(path.resolve(tls.keyPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.certPath), "utf8"),
		fsPromises.readFile(path.resolve(tls.caPath), "utf8"),
	]);
	return { key, cert, ca };
}

function _createHttpsServer(
	app: Application,
	tlsContext: { key: string; cert: string; ca: string }
): https.Server {
	return https.createServer(
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
}

function _startListening(server: https.Server, port: number): void {
	server.listen(port, () => {
		logger.info("HTTPS server listening", {
			context: {
				port,
				mtls: true,
			},
		});
	});
}

function _startTlsWatcher(server: https.Server, tls: TlsPaths): void {
	/* istanbul ignore next -- dead code: setupTlsWatcher never rejects; all errors handled internally */
	setupTlsWatcher(server, tls).catch((err) => {
		logger.error("Failed to start TLS watcher", { context: { err } });
	});
}

function _createCloseHandler(server: https.Server): () => Promise<void> {
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
	tls: TlsPaths,
	eventType: string,
	filename: string | null
): Promise<void> {
	if (eventType !== "change") {
		return;
	}

	try {
		const { key, cert, ca } = await _loadTlsFiles(tls);

		server.setSecureContext({ key, cert, ca });
		logger.info("TLS context reloaded", {
			context: { event: eventType, file: filename },
		});
	} catch (err) {
		logger.error("Failed to reload TLS context", { context: { err } });
	}
}

function createDebouncedReload(
	server: https.Server,
	tls: TlsPaths
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

async function _watchDirectory(
	dir: string,
	debouncedReload: (eventType: string, filename: string | null) => void,
): Promise<void> {
	try {
		await fsPromises.access(dir, fs.constants.R_OK);
		const watcher = fs.watch(dir, debouncedReload);
		watcher.unref();
	} catch (err) {
		logger.warn("Cannot watch TLS directory", {
			context: { dir, err: normalizeError(err) },
		});
	}
}

export async function setupTlsWatcher(server: https.Server, tls: TlsPaths): Promise<void> {
	const dirs = new Set(
		[tls.keyPath, tls.certPath, tls.caPath].map((file) =>
			path.dirname(path.resolve(file)),
		),
	);
	const debouncedReload = createDebouncedReload(server, tls);
	await Promise.all(
		[...dirs].map((dir) => _watchDirectory(dir, debouncedReload)),
	);
}
