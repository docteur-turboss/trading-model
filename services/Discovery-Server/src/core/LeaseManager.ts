import { registry } from "./ServiceRegistry";
import { logger } from "cash-lib/config/logger";
import { ServiceInstance } from "./types";

/**
 * LeaseManager
 * ----------------------------------
 *
 * The LeaseManager is responsible for enforcing the lifecycle
 * of registered service instances.
 *
 * Core responsibilities:
 * - Detect expired service instances based on TTL and heartbeats
 * - Remove dead or unreachable instances from the ServiceRegistry
 * - Provide helper utilities to evaluate instance liveness
 *
 * Conceptually, this component implements a lease-based model:
 * - Each instance owns a lease with a finite TTL
 * - Heartbeats extend the lease
 * - Missing heartbeats lead to automatic eviction
 *
 * This mechanism prevents:
 * - routing traffic to dead services
 * - stale IP/port entries after rescheduling
 * - accumulation of orphaned instances
 */
class LeaseManager {
    /**
     * Interval (in milliseconds) between two cleanup executions.
     * A smaller value increases reactivity but also CPU usage.
     */
    private cleanupIntervalMs: number;

    /**
     * Reference to the scheduled interval handler.
     * Used to prevent duplicate schedulers and to allow clean shutdown.
     */
    private intervalHandle?: NodeJS.Timeout;

    constructor(
        options?: { cleanupIntervalMs?: number }
    ) {
        /**
         * Default cleanup interval.
         * This value should generally be lower than the smallest TTL
         * configured for service instances.
         */
        this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 5000;
    }

    /**
     * -------------------------
     * Lifecycle Management
     * -------------------------
     *
     * Starts the periodic cleanup job.
     *
     * The job runs in the background and continuously
     * enforces registry consistency.
     *
     * This method is idempotent:
     * calling it multiple times will not start multiple intervals.
     */
    start(): void {
        if (this.intervalHandle) return;

        this.intervalHandle = setInterval(() => {
            try {
                this.cleanupExpiredInstances();
            } catch (err) {
                /**
                 * Errors must be caught to avoid crashing the scheduler.
                 * Any unexpected failure is logged for observability.
                 */
                logger.error("[LeaseManager] Cleanup error:", { error: err });
            }
        }, this.cleanupIntervalMs);

        logger.info(
            `[LeaseManager] Started. Cleanup every ${this.cleanupIntervalMs}ms`
        );
    }

    /**
     * Stops the periodic cleanup job.
     *
     * Typically called during graceful shutdown
     * or application lifecycle termination.
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
            logger.info("[LeaseManager] Stopped.");
        }
    }

    /**
     * -------------------------
     * Liveness Check
     * -------------------------
     *
     * Returns true if the given instance is considered alive.
     *
     * An instance is alive when:
     *   currentTime - lastHeartbeat <= ttl
     *
     * This helper can be reused by:
     * - resolution logic
     * - monitoring
     * - debugging tools
     */
    isAlive(instance: ServiceInstance): boolean {
        const now = Date.now();
        return now - instance.lastHeartbeat <= instance.ttl;
    }

    /**
     * -------------------------
     * Cleanup Logic
     * -------------------------
     *
     * Periodic cleanup job.
     *
     * Strategy:
     * - Take a snapshot of the registry state
     * - Iterate over all services and their instances
     * - Remove instances whose lease has expired
     *
     * Note:
     * The snapshot approach avoids mutation issues while iterating
     * over the underlying registry structure.
     */
    private cleanupExpiredInstances(): void {
        const snapshot = registry.dump();
        const now = Date.now();

        for (const [serviceName, instances] of Object.entries(snapshot)) {
            for (const instance of instances) {
                const expired = now - instance.lastHeartbeat > instance.ttl;

                if (expired) {
                    /**
                     * Log eviction for traceability and incident analysis.
                     */
                    logger.warn(
                        `[LeaseManager] Expired instance removed: ${instance.instanceId} (service=${serviceName})`
                    );

                    /**
                     * Remove the expired instance from the registry.
                     * Subsequent resolve calls will no longer return it.
                     */
                    registry.removeInstance(serviceName, instance.instanceId);
                }
            }
        }
    }
}

/**
 * -------------------------
 * Singleton Instance
 * -------------------------
 *
 * A single LeaseManager instance is used for the whole application.
 *
 * The cleanup interval can be configured via environment variables
 * to adapt to different environments and load profiles.
 */
export const LeaseManagerInstance = new LeaseManager({
    cleanupIntervalMs: process.env.CLEANUP_SERVICE_INTERVAL_MS
        ? Number(process.env.CLEANUP_SERVICE_INTERVAL_MS)
        : 5000,
});