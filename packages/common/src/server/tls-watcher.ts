import fs from "node:fs";
import fsPromises from "node:fs/promises";
import type https from "node:https";
import path from "node:path";
import { logger } from "../config/logger";
import type { TlsPaths } from "../domain/tls-paths";
import { toSecureContextOptions } from "../domain/tls-paths";
import { normalizeError } from "../utils/errors";
import { loadTlsFiles } from "./tls-loader";

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
		const bundle = await loadTlsFiles(tls);
		server.setSecureContext(toSecureContextOptions(bundle));
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

async function watchDirectory(
	dir: string,
	debouncedReload: (eventType: string, filename: string | null) => void
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

export async function setupTlsWatcher(
	server: https.Server,
	tls: TlsPaths
): Promise<void> {
	const dirs = new Set(
		[tls.keyPath, tls.certPath, tls.caPath].map((file) =>
			path.dirname(path.resolve(file))
		)
	);
	const debouncedReload = createDebouncedReload(server, tls);
	await Promise.all(
		[...dirs].map((dir) => watchDirectory(dir, debouncedReload))
	);
}
