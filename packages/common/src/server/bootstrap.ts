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

	/**
	 * Attempt a graceful shutdown before forcing the process to exit.
	 * Closes the HTTP server and calls the user-supplied onStop callback
	 * so that open connections and resources can be released.
	 */
	function hardShutdown(code: number): void {
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

	function bootstrap(): void {
		try {
			logger.info("Bootstrapping service", { name: options.name });

			const errorContext =
				(context: string) =>
				(err: unknown): void => {
					logger.error(context, { err: normalizeError(err) });
					hardShutdown(1);
				};

			const createServerAndFinish = (): void => {
				const result = options.createServer();
				if (result instanceof Promise) {
					result
						.then((httpServer) => {
							server = httpServer;
							setupAutoRenew(httpServer, options);
							finishBootstrap(httpServer, options);
						})
						.catch(errorContext("Fatal error during service bootstrap"));
					return;
				}
				server = result;
				setupAutoRenew(result, options);
				finishBootstrap(result, options);
			};

			const handleBeforeServer = (): void => {
				const beforeServerResult = options.onBeforeServer?.();
				if (beforeServerResult instanceof Promise) {
					beforeServerResult
						.then(() => createServerAndFinish())
						.catch(errorContext("Fatal error in onBeforeServer hook"));
					return;
				}
				createServerAndFinish();
			};

			const tlsResult = options.tlsBootstrap?.ensure();
			if (tlsResult instanceof Promise) {
				tlsResult
					.then(() => handleBeforeServer())
					.catch(errorContext("Fatal error in TLS bootstrap"));
				return;
			}

			handleBeforeServer();
		} catch (error) {
			logger.error("Fatal error during service bootstrap", {
				err: normalizeError(error),
			});
			hardShutdown(1);
		}
	}

	async function shutdown(signal: string): Promise<void> {
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
			hardShutdown(1);
		}
	}

	setupProcessHandlers(shutdown, hardShutdown);

	bootstrap();

	return { server, shutdown };
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
