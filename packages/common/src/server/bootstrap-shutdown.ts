import { logger } from "../config/logger";
import { DurationMs } from "../domain/primitives";
import { normalizeError } from "../utils/errors";
import type { BootstrapOptions } from "./bootstrap-types";
import type { HttpServer } from "./create-secure-server";

function _closeServerOnShutdown(server: HttpServer | null): void {
	if (!server) {
		return;
	}
	server.close().catch((err) =>
		logger.warn("Server close during forced shutdown failed", {
			context: { err: normalizeError(err) },
		})
	);
}

function _runOnStop(options: BootstrapOptions): void {
	if (!options.onStop) {
		return;
	}
	try {
		options.onStop();
	} catch (err) {
		logger.warn("onStop callback failed during forced shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

function _createCloseTimeoutPromise(timeoutMs: DurationMs): Promise<never> {
	return new Promise<never>((_, reject) => {
		const timer = setTimeout(
			() => reject(new Error("Server close timed out")),
			timeoutMs
		);
		timer.unref();
	});
}

async function _closeServerWithTimeout(server: HttpServer): Promise<void> {
	const closeTimeout = DurationMs.of(10000);
	await Promise.race([
		server.close(),
		_createCloseTimeoutPromise(closeTimeout),
	]);
}

export function hardShutdown(
	code: number,
	server: HttpServer | null,
	options: BootstrapOptions
): void {
	_closeServerOnShutdown(server);
	_runOnStop(options);
	logger.warn("Forced shutdown", { context: { exitCode: code } });
	process.exitCode = code;
}

export async function gracefulShutdown(
	signal: string,
	server: HttpServer | null,
	options: BootstrapOptions
): Promise<void> {
	logger.warn("Shutdown signal received", { context: { signal } });
	try {
		if (server) {
			await _closeServerWithTimeout(server);
			logger.info("HTTP server closed");
		}
		_runOnStop(options);
		logger.info("Shutdown completed gracefully");
	} catch (error) {
		logger.error("Error during graceful shutdown", {
			context: { err: normalizeError(error) },
		});
		hardShutdown(1, server, options);
	}
}
