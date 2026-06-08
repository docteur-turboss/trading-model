import { logger } from '@trading-model/common/config/logger';
import { normalizeError } from '@trading-model/common/utils/errors';

import { ServiceRegistry } from './service-registry';
import { ServiceInstance } from './types';

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
export class LeaseManager {
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
    private readonly registry: ServiceRegistry,
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
        logger.error('Cleanup error', { error: normalizeError(err) });
      }
    }, this.cleanupIntervalMs);

    logger.info('Cleanup loop started', { cleanupIntervalMs: this.cleanupIntervalMs });
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
      logger.info('Cleanup loop stopped');
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
   * - Iterate over all services via listServiceNames()
   * - For each service, iterate over its instances via getInstances()
   * - Remove instances whose lease has expired
   */
  private cleanupExpiredInstances(): void {
    const now = Date.now();

    for (const serviceName of this.registry.listServiceNames()) {
      for (const instance of this.registry.getInstances(serviceName)) {
        const expired = now - instance.lastHeartbeat > instance.ttl;

        if (expired) {
          logger.warn('Expired instance removed', {
            serviceName,
            instanceId: instance.instanceId,
          });

          try {
            this.registry.removeInstance(serviceName, instance.instanceId);
          } catch (err) {
            logger.error('Failed to remove expired instance', {
              serviceName,
              instanceId: instance.instanceId,
              error: normalizeError(err),
            });
          }
        }
      }
    }
  }
}
