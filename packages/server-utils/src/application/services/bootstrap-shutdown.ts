import { normalizeError } from "@trading-model/common/utils/errors";
import { withTimeout } from "@trading-model/common/utils/retry";
import { logger } from "@trading-model/http/infrastructure/logger";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { HttpServer } from "../../adapters/inbound/create-secure-server";
import type { BootstrapOptions } from "./bootstrap-types";

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
		Promise.resolve(options.onStop()).catch((err) =>
			logger.warn("onStop callback failed during forced shutdown", {
				context: { err: normalizeError(err) },
			})
		);
	} catch (err) {
		logger.warn("onStop callback failed during forced shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

const DEFAULT_CLOSE_TIMEOUT_MS = DurationMs.of(10000);

async function _runBeforeClose(options: BootstrapOptions): Promise<void> {
	const beforeClose = options.shutdown?.beforeClose;
	if (!beforeClose) {
		return;
	}
	try {
		await beforeClose();
	} catch (err) {
		logger.warn("beforeClose callback failed during graceful shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

async function _awaitOnStop(options: BootstrapOptions): Promise<void> {
	try {
		await options.onStop?.();
	} catch (err) {
		logger.warn("onStop callback failed during graceful shutdown", {
			context: { err: normalizeError(err) },
		});
	}
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
		await _runBeforeClose(options);
		if (server) {
			await withTimeout(
				server.close(),
				options.shutdown?.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
				"Server close timed out"
			);
			logger.info("HTTP server closed");
		}
		await _awaitOnStop(options);
		logger.info("Shutdown completed gracefully");
	} catch (error) {
		logger.error("Error during graceful shutdown", {
			context: { err: normalizeError(error) },
		});
		hardShutdown(1, server, options);
	}
}
