import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "./types";

/**
 * In-memory server-side registry of discovered service instances.
 *
 * CRUD pattern:
 *   - Create: `registerInstance(instance)`
 *   - Read:   `getInstance(identity)`, `getInstances(serviceName)`, `listServiceNames()`, `dump()`
 *   - Update: `updateHeartbeat(identity)`
 *   - Delete: `removeInstance(identity)`
 *
 * @see RedisInstanceStore — Redis-backed counterpart
 * @see CacheStore — client-side cache (address-manager)
 */
export class InstanceStore {
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();

	private _ensureBucket(serviceName: string): Map<string, ServiceInstance> {
		let instances = this._services.get(serviceName);
		if (!instances) {
			instances = new Map();
			this._services.set(serviceName, instances);
		}
		return instances;
	}

	private _mergeOrCreateInstance(
		instances: Map<string, ServiceInstance>,
		instance: ServiceInstance
	): ServiceInstance {
		const { instanceId } = instance;
		if (instances.has(instanceId)) {
			const existing = instances.get(instanceId)!;
			instances.set(instanceId, {
				...existing,
				...instance,
				lastHeartbeat: Date.now(),
			});
		} else {
			instances.set(instanceId, {
				...instance,
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});
		}
		return instances.get(instanceId)!;
	}

	registerInstance(instance: ServiceInstance): ServiceInstance {
		const { serviceName } = instance;
		const instances = this._ensureBucket(serviceName);
		return this._mergeOrCreateInstance(instances, instance);
	}

	updateHeartbeat(identity: ServiceIdentity): number | false {
		const service = this._services.get(identity.serviceName);
		if (!service) {
			return false;
		}
		const instance = service.get(identity.instanceId);
		if (!instance) {
			return false;
		}
		instance.lastHeartbeat = Date.now();
		service.set(identity.instanceId, instance);
		return instance.ttl;
	}

	getInstances(serviceName: string): ServiceInstance[] {
		const service = this._services.get(serviceName);
		if (!service) {
			return [];
		}
		return [...service.values()];
	}

	getInstance(identity: ServiceIdentity): ServiceInstance | undefined {
		return this._services.get(identity.serviceName)?.get(identity.instanceId);
	}

	removeInstance(identity: ServiceIdentity): boolean {
		const service = this._services.get(identity.serviceName);
		if (!service) {
			return false;
		}
		const deleted = service.delete(identity.instanceId);
		if (service.size === 0) {
			this._services.delete(identity.serviceName);
		}
		return deleted;
	}

	listServiceNames(): string[] {
		return [...this._services.keys()];
	}

	dump(): Record<string, ServiceInstance[]> {
		const snapshot: Record<string, ServiceInstance[]> = {};
		for (const [serviceName, instances] of this._services.entries()) {
			snapshot[serviceName] = [...instances.values()];
		}
		return snapshot;
	}
}
