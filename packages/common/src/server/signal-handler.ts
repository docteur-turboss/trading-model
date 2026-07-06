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
	onUnhandledRejection: (reason: unknown) => void,
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
	hardShutdown: HardShutdownHandler,
): void {
	if (handlersRegistered) {
		return;
	}
	handlersRegistered = true;

	const onSigTerm = _createSigTermHandler(shutdown);
	const onSigInt = _createSigIntHandler(shutdown);
	const onUncaughtException = _createUncaughtExceptionHandler(hardShutdown);
	const onUnhandledRejection = _createUnhandledRejectionHandler(hardShutdown);

	process.on("SIGTERM", onSigTerm);
	process.on("SIGINT", onSigInt);
	process.on("uncaughtException", onUncaughtException);
	process.on("unhandledRejection", onUnhandledRejection);

	CLEANUP_FNS.push(
		_buildCleanupFn(onSigTerm, onSigInt, onUncaughtException, onUnhandledRejection),
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
