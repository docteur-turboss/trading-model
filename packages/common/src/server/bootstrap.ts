import type https from "node:https";
import { logger } from "../config/logger";
import { normalizeError } from "../utils/errors";
import type { HttpServer } from "./create-secure-server";
import { setupProcessHandlers } from "./signal-handler";

/** TLS bootstrap configuration for automatic certificate lifecycle management. */
export interface TlsBootstrapOptions {
	ensure: () => Promise<void>;
	setupAutoRenew?: (server: https.Server) => void;
}

/** Options for configuring a service bootstrap lifecycle. */
export interface BootstrapOptions {
	name: string;
	createServer: () => HttpServer | Promise<HttpServer>;
	onBeforeServer?: () => void | Promise<void>;
	onStart?: () => void;
	onStop?: () => void;
	tlsBootstrap?: TlsBootstrapOptions | null;
}

/**
 * Initializes and starts a service, delegating process signal management to
 * {@link setupProcessHandlers} (SRP).
 * Returns handles to the running server and a shutdown trigger.
 */
export function createBootstrap(options: BootstrapOptions): {
	server: HttpServer | null;
	shutdown: (signal: string) => Promise<void>;
} {
	let server: HttpServer | null = null;
	const doHardShutdown = (code: number) => hardShutdown(code, server, options);
	const doShutdown = (signal: string) => gracefulShutdown(signal, server, options);
	setupProcessHandlers(doShutdown, doHardShutdown);
	runBootstrap(options, (svr) => { server = svr; }, doHardShutdown);
	return { server, shutdown: doShutdown };
}

function _closeServerOnShutdown(server: HttpServer | null): void {
	if (!server) return;
	server.close().catch((err) =>
		logger.warn("Server close during forced shutdown failed", {
			context: { err: normalizeError(err) },
		}),
	);
}

function _runOnStop(options: BootstrapOptions): void {
	if (!options.onStop) return;
	try {
		options.onStop();
	} catch (err) {
		logger.warn("onStop callback failed during forced shutdown", {
			context: { err: normalizeError(err) },
		});
	}
}

function hardShutdown(code: number, server: HttpServer | null, options: BootstrapOptions): void {
	_closeServerOnShutdown(server);
	_runOnStop(options);
	logger.warn("Forced shutdown", { context: { exitCode: code } });
	process.exitCode = code;
}

function _onBootstrapError(onFatal: (code: number) => void, err: unknown): void {
	logger.error("Fatal error during service bootstrap", {
		context: { err: normalizeError(err) },
	});
	onFatal(1);
}

function runBootstrap(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onFatal: (code: number) => void,
): void {
	const onError = (err: unknown) => _onBootstrapError(onFatal, err);
	logger.info("Bootstrapping service", { context: { name: options.name } });
	runSyncOrAsync(
		() => options.tlsBootstrap?.ensure(),
		() => _handleBeforeServer(options, setServer, onError),
		onError,
	);
}

function _handleBeforeServer(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onError: (err: unknown) => void,
): void {
	runSyncOrAsync(
		() => options.onBeforeServer?.(),
		() => _finishCreateServer(options, setServer, onError),
		onError,
	);
}

function _finishCreateServer(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onError: (err: unknown) => void,
): void {
	runSyncOrAsync(
		() => options.createServer(),
		(httpServer) => {
			setServer(httpServer);
			setupAutoRenew(httpServer, options);
			finishBootstrap(httpServer, options);
		},
		onError,
	);
}

function runSyncOrAsync<TValue>(
	fn: () => TValue | Promise<TValue> | undefined,
	onSuccess: (value: TValue) => void,
	onError: (err: unknown) => void
): void {
	try {
		const result = fn();
		if (result instanceof Promise) {
			result.then(onSuccess).catch(onError);
		} else if (result === undefined) {
			(onSuccess as (value: unknown) => void)(undefined);
		} else {
			onSuccess(result);
		}
	} catch (err) {
		onError(err);
	}
}

async function _closeServerWithTimeout(server: HttpServer): Promise<void> {
	const closeTimeout = 10000;
	let rejectTimeout: ((reason: Error) => void) | undefined;
	const timeoutPromise = new Promise<void>((_, reject) => {
		rejectTimeout = reject;
	});
	const timeoutHandle = setTimeout(
		() => rejectTimeout?.(new Error("Server close timed out")),
		closeTimeout,
	);
	try {
		await Promise.race([server.close(), timeoutPromise]);
	} finally {
		clearTimeout(timeoutHandle);
	}
}

async function gracefulShutdown(
	signal: string,
	server: HttpServer | null,
	options: BootstrapOptions,
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

function setupAutoRenew(
	httpServer: HttpServer,
	options: BootstrapOptions
): void {
	if (options.tlsBootstrap?.setupAutoRenew) {
		options.tlsBootstrap.setupAutoRenew(httpServer.raw);
	}
}

function finishBootstrap(
	_httpServer: HttpServer,
	options: BootstrapOptions
): void {
	if (options.onStart) {
		options.onStart();
	}
	logger.info("Service started successfully", {
		context: { name: options.name },
	});
}
