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
	const doShutdown = (signal: string) =>
		gracefulShutdown(signal, server, options);

	setupProcessHandlers(doShutdown, doHardShutdown);

	runBootstrap(
		options,
		(svr) => {
			server = svr;
		},
		doHardShutdown
	);

	return { server, shutdown: doShutdown };
}

function hardShutdown(
	code: number,
	server: HttpServer | null,
	options: BootstrapOptions
): void {
	if (server) {
		server.close().catch((err) =>
			logger.warn("Server close during forced shutdown failed", {
				err: normalizeError(err),
			})
		);
	}

	if (options.onStop) {
		try {
			options.onStop();
		} catch (err) {
			logger.warn("onStop callback failed during forced shutdown", {
				err: normalizeError(err),
			});
		}
	}

	logger.warn("Forced shutdown", { exitCode: code });
	process.exitCode = code;
}

function runBootstrap(
	options: BootstrapOptions,
	setServer: (server: HttpServer) => void,
	onFatal: (code: number) => void
): void {
	const onError = (err: unknown) => {
		logger.error("Fatal error during service bootstrap", {
			err: normalizeError(err),
		});
		onFatal(1);
	};

	logger.info("Bootstrapping service", { name: options.name });

	const finishCreateServer = () => {
		runSyncOrAsync(
			() => options.createServer(),
			(httpServer) => {
				setServer(httpServer);
				setupAutoRenew(httpServer, options);
				finishBootstrap(httpServer, options);
			},
			onError
		);
	};

	const handleBeforeServer = () => {
		runSyncOrAsync(
			() => options.onBeforeServer?.(),
			finishCreateServer,
			onError
		);
	};

	runSyncOrAsync(
		() => options.tlsBootstrap?.ensure(),
		handleBeforeServer,
		onError
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

async function gracefulShutdown(
	signal: string,
	server: HttpServer | null,
	options: BootstrapOptions
): Promise<void> {
	logger.warn("Shutdown signal received", { signal });

	try {
		if (server) {
			const closeTimeout = 10000;
			let rejectTimeout: ((reason: Error) => void) | undefined;
			const timeoutPromise = new Promise<void>((_, reject) => {
				rejectTimeout = reject;
			});
			const timeoutHandle = setTimeout(
				() => rejectTimeout?.(new Error("Server close timed out")),
				closeTimeout
			);
			try {
				await Promise.race([server.close(), timeoutPromise]);
			} finally {
				clearTimeout(timeoutHandle);
			}
			logger.info("HTTP server closed");
		}

		if (options.onStop) {
			try {
				options.onStop();
			} catch (error) {
				logger.warn("onStop callback failed during shutdown", {
					err: normalizeError(error),
				});
			}
		}

		logger.info("Shutdown completed gracefully");
	} catch (error) {
		logger.error("Error during graceful shutdown", {
			err: normalizeError(error),
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
	logger.info("Service started successfully", { name: options.name });
}
