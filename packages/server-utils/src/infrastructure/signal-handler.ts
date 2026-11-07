import { logger } from "@trading-model/http/infrastructure/logger";

/** Callback signature for graceful shutdown. */
export type ShutdownHandler = (signal: string) => Promise<void>;

/** Callback signature for forced shutdown. */
export type HardShutdownHandler = (code: number) => void;

/** Removes the registered listeners; null while none are registered. */
let cleanup: (() => void) | null = null;

/**
 * Registers process-level signal and error handlers, once per process.
 *
 * @param shutdown  - Graceful shutdown handler (SIGTERM, SIGINT).
 * @param hardShutdown - Forced shutdown handler (uncaughtException, unhandledRejection).
 */
export function setupProcessHandlers(
	shutdown: ShutdownHandler,
	hardShutdown: HardShutdownHandler
): void {
	if (cleanup) {
		return;
	}
	const onSignal = async (signal: "SIGTERM" | "SIGINT") => {
		logger.warn(`${signal} received`);
		await shutdown(signal);
	};
	const onSigTerm = () => onSignal("SIGTERM");
	const onSigInt = () => onSignal("SIGINT");
	const onUncaughtException = (error: Error) => {
		logger.error("Uncaught exception - exiting", { context: { err: error } });
		hardShutdown(1);
	};
	const onUnhandledRejection = (reason: unknown) => {
		logger.error("Unhandled promise rejection - exiting", {
			context: { reason },
		});
		hardShutdown(1);
		process.exit(1);
	};

	process.on("SIGTERM", onSigTerm);
	process.on("SIGINT", onSigInt);
	process.on("uncaughtException", onUncaughtException);
	process.on("unhandledRejection", onUnhandledRejection);
	cleanup = () => {
		process.removeListener("SIGTERM", onSigTerm);
		process.removeListener("SIGINT", onSigInt);
		process.removeListener("uncaughtException", onUncaughtException);
		process.removeListener("unhandledRejection", onUnhandledRejection);
	};
}

/**
 * Removes all registered process handlers.
 * Useful for test cleanup to avoid side effects between tests.
 */
export function removeProcessHandlers(): void {
	cleanup?.();
	cleanup = null;
}
