import { bootstrapAddressManager } from 'config/address-manager';
import { logger } from 'cash-lib/config/logger';
import { createServer } from "./server";
import '/config/env';

/**
 * Reference to the running HTTP server instance.
 * 
 * Stored at module scope to allow lifecycle coordination
 * between bootstrap and shutdown handlers.
 */
let server: ReturnType<typeof createServer> | null = null
let addressManager: ReturnType<typeof bootstrapAddressManager> | null = null

/**
 * Bootstraps the Financial Scrapper service.
 * 
 * @description
 * Initializes core runtime components required for the service
 * to operate.
 * 
 * Any error occurring during this phase is considered fatal
 * and results in an immediate process termination.
 * 
 * @returns {Promise<void>}
 * 
 * @lifecycle
 * Must be called exactly once during process startup
 */
async function bootstrap(): Promise<void> {
    try {
        logger.info('Bootstrapping Financial Scrapper service')

        /**
         * Start the HTTPS server exposing technical endpoints
         * (health checks, metrics, administration).
         */
        server = createServer();

        addressManager = bootstrapAddressManager();
        // message manager startup here

        logger.info('Financial Scrapper started successfully')
    } catch (error) {
        logger.error(
            'Fatal error during service bootstrap',
            { err: error },
        )
        process.exit(1)
    }
}


/**
 * Gracefully shuts down the service.
 * 
 * @description
 * Handles process termination signals by:
 * - Stopping the HTTP server
 * - Stopping the address manager
 * - Stopping the message manager
 * 
 * If shutdown fails, the process exits with a non-zero code.
 * 
 * @param {string} signal
 * The OS signal that triggered the shutdown (e.g. SIGTERM, SIGINT).
 */
async function shutdown(signal: string): Promise<void> {
    logger.warn('Shutdown signal received', { signal })

    try {
        if (server) {
            await server.close()
            logger.info('HTTP server closed')
        }

        if (addressManager) {
            addressManager.stop()
        }

        logger.info('Shutdown completed gracefully')
        process.exit(0)
    } catch (error) {
        logger.error(
            'Error during graceful shutdown',
            { err: error }
        )
        process.exit(1)
    }
}

/**
 * ─────────────────────────────────────────────────────────────
 * Process-level safety nets
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Handle termination signals from the operating system.
 */
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)

/**
 * Catch synchronous, uncaught exceptions.
 * 
 * These indicate unrecoverable application states.
 */
process.on('uncaughtException', (error) => {
    logger.error(
        'Uncaught exception - exiting',
        { err: error },
    )
    process.exit(1)
})

/**
 * Catch unhandled promise rejections.
 * 
 * These are treated as fatal to avoid running
 * in an inconsistent state
 */
process.on('unhandledRejection', (reason) => {
    logger.error(
        'Unhandled promise rejection - exiting',
        { reason },
    )
    process.exit(1);
})

/**
 * ─────────────────────────────────────────────────────────────
 * Startup
 * ─────────────────────────────────────────────────────────────
 */
bootstrap();

// import { fetchHistoryWorker } from "../job/workers/fetchCandleHistory.worker";

// fetchHistoryWorker({
//   symbol: "ETHUSDT",
//   interval: "5m",
//   startFrom: 1514764800000, // 2018
//   engine: "binance"
// });