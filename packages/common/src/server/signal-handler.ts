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
export function setupProcessHandlers(
	shutdown: ShutdownHandler,
	hardShutdown: HardShutdownHandler
): void {
	if (handlersRegistered) {
		return;
	}
	handlersRegistered = true;

	const onSigTerm = async () => {
		logger.warn("SIGTERM received");
		await shutdown("SIGTERM");
	};

	const onSigInt = async () => {
		logger.warn("SIGINT received");
		await shutdown("SIGINT");
	};

	const onUncaughtException = (error: Error) => {
		logger.error("Uncaught exception - exiting", { err: error });
		hardShutdown(1);
	};

	const onUnhandledRejection = (reason: unknown) => {
		logger.error("Unhandled promise rejection - exiting", { reason });
		hardShutdown(1);
		// Node.js 15+ does not terminate on unhandledRejection when a handler exists.
		// If active handles (WebSocket, timers) keep the loop busy, setImmediate may
		// never fire — call exit directly so the process doesn't remain zombie.
		process.exit(1);
	};

	process.on("SIGTERM", onSigTerm);
	process.on("SIGINT", onSigInt);
	process.on("uncaughtException", onUncaughtException);
	process.on("unhandledRejection", onUnhandledRejection);

	CLEANUP_FNS.push(() => {
		process.removeListener("SIGTERM", onSigTerm);
		process.removeListener("SIGINT", onSigInt);
		process.removeListener("uncaughtException", onUncaughtException);
		process.removeListener("unhandledRejection", onUnhandledRejection);
	});
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
