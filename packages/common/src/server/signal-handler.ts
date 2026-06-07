import { logger } from '../config/logger';

/** Callback signature for graceful shutdown. */
export type ShutdownHandler = (signal: string) => Promise<void>;

/** Callback signature for forced shutdown. */
export type HardShutdownHandler = (code: number) => void;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SignalListener = (...args: any[]) => void;

/** Tracks registered signal listeners for cleanup. */
const registeredSignals = new Map<string, SignalListener>();

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
  const onSigTerm = async () => {
    logger.warn('SIGTERM received');
    await shutdown('SIGTERM');
  };

  const onSigInt = async () => {
    logger.warn('SIGINT received');
    await shutdown('SIGINT');
  };

  const onUncaughtException = (error: Error) => {
    logger.error('Uncaught exception - exiting', { err: error });
    hardShutdown(1);
  };

  const onUnhandledRejection = (reason: unknown) => {
    logger.error('Unhandled promise rejection - exiting', { reason });
    hardShutdown(1);
  };

  process.on('SIGTERM', onSigTerm);
  process.on('SIGINT', onSigInt);
  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  registeredSignals.set('SIGTERM', onSigTerm);
  registeredSignals.set('SIGINT', onSigInt);
  registeredSignals.set('uncaughtException', onUncaughtException);
  registeredSignals.set('unhandledRejection', onUnhandledRejection);
}

/**
 * Removes all registered process handlers.
 * Useful for test cleanup to avoid side effects between tests.
 */
export function removeProcessHandlers(): void {
  for (const [signal, handler] of registeredSignals) {
    process.removeListener(signal, handler);
  }
  registeredSignals.clear();
}
