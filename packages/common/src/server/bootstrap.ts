import { HttpServer } from './create-secure-server';
import { setupProcessHandlers } from './signal-handler';
import { logger } from '../config/logger';

/** Options for configuring a service bootstrap lifecycle. */
export interface BootstrapOptions {
  name: string;
  createServer: () => HttpServer | Promise<HttpServer>;
  onStart?: () => void;
  onStop?: () => void;
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
      server.close().catch(() => {});
    }

    if (options.onStop) {
      try {
        options.onStop();
      } catch {
        /* cleanup error during forced shutdown — ignore */
      }
    }

    logger.warn('Forced shutdown', { exitCode: code });
    if (code !== 0) {
      process.exitCode = code;
    }
  }

  function bootstrap(): void {
    try {
      logger.info(`Bootstrapping ${options.name} service`);

      const result = options.createServer();
      if (result instanceof Promise) {
        result
          .then(s => {
            server = s;
            finishBootstrap();
          })
          .catch(err => {
            logger.error('Fatal error during service bootstrap', { err });
            hardShutdown(1);
          });
        return;
      }

      server = result;
      finishBootstrap();
    } catch (error) {
      logger.error('Fatal error during service bootstrap', { err: error });
      hardShutdown(1);
    }

    function finishBootstrap(): void {
      if (options.onStart) {
        try {
          options.onStart();
        } catch (error) {
          logger.error('onStart callback failed — aborting bootstrap', { err: error });
          hardShutdown(1);
          return;
        }
      }
      logger.info(`${options.name} started successfully`);
    }
  }

  async function shutdown(signal: string): Promise<void> {
    logger.warn('Shutdown signal received', { signal });

    try {
      if (server) {
        await server.close();
        logger.info('HTTP server closed');
      }

      if (options.onStop) {
        try {
          options.onStop();
        } catch (error) {
          logger.warn('onStop callback failed during shutdown', { err: error });
        }
      }

      logger.info('Shutdown completed gracefully');
    } catch (error) {
      logger.error('Error during graceful shutdown', { err: error });
      hardShutdown(1);
    }
  }

  setupProcessHandlers(shutdown, hardShutdown);

  bootstrap();

  return { server, shutdown };
}
