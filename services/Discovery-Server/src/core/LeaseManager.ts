import { ServiceRegistry } from "./ServiceRegistry";
import { logger } from "cash-lib/config/logger";
import { ServiceInstance } from "./types";

/**
 * LeaseManager
 * ----------------------------------
 * Responsible for:
 * - Detecting expired service instances
 * - Removing dead entries from the ServiceRegistry
 * - Providing a helper to check if an instance is still alive
 * 
 * Works with TTL and lastHeartbeat:
 * instance is expired when:
 *   now - lastHeartbeat > instance.ttl
 */
export class LeaseManager {
    private cleanupIntervalMs: number;
    private intervalHandle?: NodeJS.Timeout;

    constructor(
        private registry: ServiceRegistry,
        options?: { cleanupIntervalMs?: number }
    ) {
        this.cleanupIntervalMs = options?.cleanupIntervalMs ?? 5000;
    }

    /**
     * Start periodic cleanup job.
     */
    start(): void {
        if (this.intervalHandle) return;

        this.intervalHandle = setInterval(() => {
            try {
                this.cleanupExpiredInstances();
            } catch (err) {
                logger.error("[LeaseManager] Cleanup error:", {error : err});
            }
        }, this.cleanupIntervalMs);

        logger.info(
            `[LeaseManager] Started. Cleanup every ${this.cleanupIntervalMs}ms`
        );
    }

    /**
     * Stop the scheduled job.
     */
    stop(): void {
        if (this.intervalHandle) {
            clearInterval(this.intervalHandle);
            this.intervalHandle = undefined;
            logger.info("[LeaseManager] Stopped.");
        }
    }

    /**
     * Returns true if an instance is still alive (TTL not exceeded).
     */
    isAlive(instance: ServiceInstance): boolean {
        const now = Date.now();
        return now - instance.lastHeartbeat <= instance.ttl;
    }

    /**
     * Cleanup job executed periodically.
     * Scans all registered services and evicts dead instances.
     */
    private cleanupExpiredInstances(): void {
        const snapshot = this.registry.dump();
        const now = Date.now();

        for (const [serviceName, instances] of Object.entries(snapshot)) {
            for (const instance of instances) {
                const expired = now - instance.lastHeartbeat > instance.ttl;

                if (expired) {
                    logger.warn(
                        `[LeaseManager] Expired instance removed: ${instance.instanceId} (service=${serviceName})`
                    );

                    this.registry.removeInstance(serviceName, instance.instanceId);
                }
            }
        }
    }
}
