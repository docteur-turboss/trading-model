import { LeaseManagerInstance } from "../core/LeaseManager";


/**
 * @file index.ts
 * 
 * @description
 * Application entry point for the Message Manager service.
 * 
 * This module is responsible for orchestrating the full lifecycle of the service:
 * - Environment validation and early failure
 * - Initialization of asynchronous infrastructure components
 * - Startup of the HTTPS API server
 * - Process-level error handling
 * - Graceful shutdown on termination signals
 * 
 * This file must remain intentionnaly thin and declarative.
 * All business logic and infrastructure concerns are delegated
 * to dedicated modules.
 * 
 * @responsability
 * - Bootstrap the application in the correct order
 * - Ensure the runtime environment is loaded and validated
 * - Coordinate startup and shutdown of core dependecies
 * - Act as the single process entry point
 * 
 * @restrictions 
 * - Must not contain business logic
 * - Must not expose application internals
 * - Must exit the process explicitly on fatal failures
 * - Side effects are limited to initialization and teardown
 * 
 * @architecture
 * This file belongs to the application layer and serves as the composition root of the service.
 * 
 * @author docteur-turboss
 * 
 * @version 1.0.0
 * 
 * @since 2026.01.24
 */

import { logger } from "cash-lib/config/logger";
import { createServer } from "./server";
import '/config/env';

/**
 * Reference to the running HTTP server instance.
 * 
 * Stored at module scope to allow lifecycle coordination
 * between bootstrap and shutdown handlers.
 */
let server: ReturnType<typeof createServer> | null = null

/**
 * Bootstraps the Message Manager service.
 * 
 * @function bootstrap
 * 
 * @description
 * Executes the startup sequence of the application.
 * 
 * Any error occurring during this phase is considered fatal
 * and results in an immediate process termination.
 * 
 * @returns {Promise<void>}
 * 
 * @throws {Error}
 * Throws if any dependency fails to initialize or if the server 
 * cannot be started.
 * 
 * @lifecycle
 * Must be called exactly once during process startup
 */
async function bootstrap(): Promise<void> {
    try {
        logger.info('Bootstrapping Address Manager service')

        /**
         * Start the HTTPS server exposing technical endpoints
         * (health checks, metrics, administration).
         */
        server = createServer()
        LeaseManagerInstance.start();

        logger.info('Address Manager started successfully')
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
 * @function shutdown
 * 
 * @description
 * Handles process termination signals by:
 * - Stopping the HTTP server from accepting new connections
 * - Allowing in-flight requests and messages to complete
 * - Closing message bus and broker connections
 * 
 * If shutdown fails, the process exits with a non-zero code.
 * 
 * @param {string} signal
 * The OS signal that triggered the shutdown (e.g. SIGTERM, SIGINT).
 * 
 * @returns {Promise<void>}
 * 
 * @lifecycle
 * Invoked by process signal handlers.
 */
async function shutdown(signal: string): Promise<void> {
    logger.warn('Shutdown signal received', { signal })

    try {
        if (server) {
            server.close()
            logger.info('HTTP server closed')
        }

        LeaseManagerInstance.stop()

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