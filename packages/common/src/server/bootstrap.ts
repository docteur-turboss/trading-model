import https from 'node:https';

import { HttpServer } from './create-secure-server';
import { setupProcessHandlers } from './signal-handler';
import { logger } from '../config/logger';
import { normalizeError } from '../utils/errors';

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
      server.close().catch(err => logger.warn('Server close during forced shutdown failed', { err: normalizeError(err) }));
    }

    if (options.onStop) {
      try {
        options.onStop();
      } catch (err) {
        logger.warn('onStop callback failed during forced shutdown', { err: normalizeError(err) });
      }
    }

    logger.warn('Forced shutdown', { exitCode: code });
    process.exitCode = code;
  }

  function bootstrap(): void {
    try {
      logger.info('Bootstrapping service', { name: options.name });

      const tlsResult = options.tlsBootstrap?.ensure();

      const afterTls = (): void => {
        const beforeServerResult = options.onBeforeServer?.();

        const afterBeforeServer = (): void => {
          const result = options.createServer();
          if (result instanceof Promise) {
            result
              .then(s => {
                server = s;
                setupAutoRenew(s);
                finishBootstrap();
              })
              .catch(err => {
                logger.error('Fatal error during service bootstrap', { err: normalizeError(err) });
                hardShutdown(1);
              });
            return;
          }

          server = result;
          setupAutoRenew(result);
          finishBootstrap();
        };

        if (beforeServerResult instanceof Promise) {
          beforeServerResult
            .then(() => afterBeforeServer())
            .catch(err => {
              logger.error('Fatal error in onBeforeServer hook', { err: normalizeError(err) });
              hardShutdown(1);
            });
          return;
        }

        afterBeforeServer();
      };

      if (tlsResult instanceof Promise) {
        tlsResult
          .then(() => afterTls())
          .catch(err => {
            logger.error('Fatal error in TLS bootstrap', { err: normalizeError(err) });
            hardShutdown(1);
          });
        return;
      }

      afterTls();
    } catch (error) {
      logger.error('Fatal error during service bootstrap', { err: normalizeError(error) });
      hardShutdown(1);
    }

    /**
     * Hooks the TLS auto-renew callback into the server lifecycle.
     * Called once after the server is created — the callback wires into
     * file watchers or ACME challenge handlers that rotate certificates
     * without restarting the process.
     */
    function setupAutoRenew(s: HttpServer): void {
      if (options.tlsBootstrap?.setupAutoRenew) {
        options.tlsBootstrap.setupAutoRenew(s.raw);
      }
    }

    /**
     * Fires the onStart callback and logs successful completion.
     * If onStart throws, the process is shut down with code 1.
     */
    function finishBootstrap(): void {
      if (options.onStart) {
        try {
          options.onStart();
        } catch (error) {
          logger.error('onStart callback failed — aborting bootstrap', {
            err: normalizeError(error),
          });
          hardShutdown(1);
          return;
        }
      }
      logger.info('Service started successfully', { name: options.name });
    }
  }

  async function shutdown(signal: string): Promise<void> {
    logger.warn('Shutdown signal received', { signal });

    try {
      if (server) {
        const closeTimeout = 10000;
        await Promise.race([
          server.close(),
          new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Server close timed out')), closeTimeout);
          }),
        ]);
        logger.info('HTTP server closed');
      }

      if (options.onStop) {
        try {
          options.onStop();
        } catch (error) {
          logger.warn('onStop callback failed during shutdown', { err: normalizeError(error) });
        }
      }

      logger.info('Shutdown completed gracefully');
    } catch (error) {
      logger.error('Error during graceful shutdown', { err: normalizeError(error) });
      hardShutdown(1);
    }
  }

  setupProcessHandlers(shutdown, hardShutdown);

  bootstrap();

  return { server, shutdown };
}
