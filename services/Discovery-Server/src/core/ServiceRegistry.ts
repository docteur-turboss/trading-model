import { ServiceInstance } from "./types";

/**
 * ServiceRegistry
 * ----------------------------
 * Maintains an in-memory index of all service instances registered in the
 * discovery system. 
 * - Supports multi-instance for each service
 * - Deduplicates registrations
 * - Updates existing instances instead of recreating them
 * - Integrates seamlessly with LeaseManager for TTL-based eviction
 * 
 * This class can later be swapped with a distributed backend (Redis, etcd).
 */
export class ServiceRegistry {
    /**
     * Index structure:
     * - Map<serviceName, Map<instanceId, ServiceInstance>>
     */
    private services: Map<string, Map<string, ServiceInstance>> = new Map();

    /**
     * Registers or updates a service instance.
     * Idempotent: if the instance already exists, only updates metadata/heartbeat.
     */
    registerInstance(instance: ServiceInstance): ServiceInstance {
        const { serviceName, instanceId } = instance;

        if (!this.services.has(serviceName)) {
            this.services.set(serviceName, new Map());
        }

        const instances = this.services.get(serviceName)!;

        // If instance already exists → merge/update
        if (instances.has(instanceId)) {
            const existing = instances.get(instanceId)!;

            instances.set(instanceId, {
                ...existing,
                ...instance,
                lastHeartbeat: Date.now() // reset to now
            });
        } else {
            // New instance registration
            instances.set(instanceId, {
                ...instance,
                registeredAt: Date.now(),
                lastHeartbeat: Date.now()
            });
        }

        return instances.get(instanceId)!;
    }

    /**
     * Updates only the heartbeat for an instance.
     * Called by HeartbeatController.
     */
    updateHeartbeat(serviceName: string, instanceId: string): number | false {
        const service = this.services.get(serviceName);
        if (!service) return false;

        const instance = service.get(instanceId);
        if (!instance) return false;

        instance.lastHeartbeat = Date.now();
        return instance.ttl;
    }

    /**
     * Returns all live or dead instances of a service.
     */
    getInstances(serviceName: string): ServiceInstance[] {
        const service = this.services.get(serviceName);
        if (!service) return [];
        return [...service.values()];
    }

    /**
     * Returns a specific instance.
     */
    getInstance(serviceName: string, instanceId: string): ServiceInstance | undefined {
        return this.services.get(serviceName)?.get(instanceId);
    }

    /**
     * Removes an instance from the registry.
     * Called by LeaseManager when an instance expires.
     */
    removeInstance(serviceName: string, instanceId: string): boolean {
        const service = this.services.get(serviceName);
        if (!service) return false;

        const deleted = service.delete(instanceId);

        // If no more instances exist → remove service entry
        if (service.size === 0) {
            this.services.delete(serviceName);
        }

        return deleted;
    }

    /**
     * Returns all services in the system (names only).
     */
    listServiceNames(): string[] {
        return [...this.services.keys()];
    }

    /**
     * Returns a raw snapshot of the registry, useful for
     * GET /services endpoint.
     */
    dump(): Record<string, ServiceInstance[]> {
        const snapshot: Record<string, ServiceInstance[]> = {};

        for (const [serviceName, instances] of this.services.entries()) {
            snapshot[serviceName] = [...instances.values()];
        }

        return snapshot;
    }
}