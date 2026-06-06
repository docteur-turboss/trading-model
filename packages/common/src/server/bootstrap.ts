import { HttpServer } from './create-secure-server';
import { logger } from '../config/logger';

/** Options for configuring a service bootstrap lifecycle. */
export interface BootstrapOptions {
  name: string;
  createServer: () => HttpServer;
  onStart?: () => void;
  onStop?: () => void;
}

/**
 * Initializes and starts a service, binding process-level shutdown handlers.
 * Returns handles to the running server and a shutdown trigger.
 */
export function createBootstrap(options: BootstrapOptions): {
  server: HttpServer | null;
  shutdown: (signal: string) => Promise<void>;
} {
  let server: HttpServer | null = null;

  function bootstrap(): void {
    try {
      logger.info(`Bootstrapping ${options.name} service`);

      server = options.createServer();

      if (options.onStart) {
        options.onStart();
      }

      logger.info(`${options.name} started successfully`);
    } catch (error) {
      logger.error('Fatal error during service bootstrap', { err: error });
      process.exit(1);
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
        options.onStop();
      }

      logger.info('Shutdown completed gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', { err: error });
      process.exit(1);
    }
  }

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  process.on('uncaughtException', error => {
    logger.error('Uncaught exception - exiting', { err: error });
    process.exit(1);
  });

  process.on('unhandledRejection', reason => {
    logger.error('Unhandled promise rejection - exiting', { reason });
    process.exit(1);
  });

  bootstrap();

  return { server, shutdown };
}
