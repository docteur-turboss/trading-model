import { logger } from "../config/logger";

/** Callback signature for graceful shutdown. */
export type ShutdownHandler = (signal: string) => Promise<void>;

/** Callback signature for forced shutdown. */
export type HardShutdownHandler = (code: number) => void;

type CleanupFn = () => void;

/** Tracks cleanup functions for registered listeners. */
const CLEANUP_FNS: CleanupFn[] = [];
let handlersRegistered = false;

/**
 * Registers process-level signal and error handlers.
 * Separated from the bootstrap lifecycle to respect SRP.
 *
 * @param shutdown  - Graceful shutdown handler (SIGTERM, SIGINT).
 * @param hardShutdown - Forced shutdown handler (uncaughtException, unhandledRejection).
 */
function _buildCleanupFn(
	onSigTerm: () => Promise<void>,
	onSigInt: () => Promise<void>,
	onUncaughtException: (error: Error) => void,
	onUnhandledRejection: (reason: unknown) => void
): () => void {
	return () => {
		process.removeListener("SIGTERM", onSigTerm);
		process.removeListener("SIGINT", onSigInt);
		process.removeListener("uncaughtException", onUncaughtException);
		process.removeListener("unhandledRejection", onUnhandledRejection);
	};
}

export function setupProcessHandlers(
	shutdown: ShutdownHandler,
	hardShutdown: HardShutdownHandler
): void {
	if (handlersRegistered) {
		return;
	}
	handlersRegistered = true;

	const handlers = _createHandlers(shutdown, hardShutdown);
	_registerHandlers(handlers);
	_registerCleanup(handlers);
}

interface _Handlers {
	onSigTerm: () => Promise<void>;
	onSigInt: () => Promise<void>;
	onUncaughtException: (error: Error) => void;
	onUnhandledRejection: (reason: unknown) => void;
}

function _createHandlers(
	shutdown: ShutdownHandler,
	hardShutdown: HardShutdownHandler
): _Handlers {
	return {
		onSigTerm: _createSigTermHandler(shutdown),
		onSigInt: _createSigIntHandler(shutdown),
		onUncaughtException: _createUncaughtExceptionHandler(hardShutdown),
		onUnhandledRejection: _createUnhandledRejectionHandler(hardShutdown),
	};
}

function _registerHandlers(handlers: _Handlers): void {
	process.on("SIGTERM", handlers.onSigTerm);
	process.on("SIGINT", handlers.onSigInt);
	process.on("uncaughtException", handlers.onUncaughtException);
	process.on("unhandledRejection", handlers.onUnhandledRejection);
}

function _registerCleanup(handlers: _Handlers): void {
	CLEANUP_FNS.push(
		_buildCleanupFn(
			handlers.onSigTerm,
			handlers.onSigInt,
			handlers.onUncaughtException,
			handlers.onUnhandledRejection
		)
	);
}

function _createSigTermHandler(shutdown: ShutdownHandler): () => Promise<void> {
	return async () => {
		logger.warn("SIGTERM received");
		await shutdown("SIGTERM");
	};
}

function _createSigIntHandler(shutdown: ShutdownHandler): () => Promise<void> {
	return async () => {
		logger.warn("SIGINT received");
		await shutdown("SIGINT");
	};
}

function _createUncaughtExceptionHandler(
	hardShutdown: HardShutdownHandler
): (error: Error) => void {
	return (error: Error) => {
		logger.error("Uncaught exception - exiting", { context: { err: error } });
		hardShutdown(1);
	};
}

function _createUnhandledRejectionHandler(
	hardShutdown: HardShutdownHandler
): (reason: unknown) => void {
	return (reason: unknown) => {
		logger.error("Unhandled promise rejection - exiting", {
			context: { reason },
		});
		hardShutdown(1);
		process.exit(1);
	};
}

/**
 * Removes all registered process handlers.
 * Useful for test cleanup to avoid side effects between tests.
 */
export function removeProcessHandlers(): void {
	for (const cleanup of CLEANUP_FNS) {
		cleanup();
	}
	CLEANUP_FNS.length = 0;
	handlersRegistered = false;
}
