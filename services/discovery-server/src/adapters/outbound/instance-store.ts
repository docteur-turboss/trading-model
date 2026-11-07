import {
	type InstanceId,
	type ServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import {
	ALL_SERVICE_NAMES,
	type ServiceInstanceName,
} from "@trading-model/primitives/service-instance-name";
import type { IInstanceStore } from "../../domain/ports/instance-store.interface";
import type { ServiceInstance } from "../../shared/types";

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
export class InstanceStore implements IInstanceStore {
	private _services: Map<
		ServiceId | ServiceInstanceName,
		Map<InstanceId, ServiceInstance>
	> = new Map();

	private _ensureBucket(
		serviceName: ServiceId
	): Map<InstanceId, ServiceInstance> {
		let instances = this._services.get(serviceName);
		if (!instances) {
			instances = new Map();
			this._services.set(serviceName, instances);
		}
		return instances;
	}

	private _mergeOrCreateInstance(
		instances: Map<InstanceId, ServiceInstance>,
		instance: ServiceInstance
	): ServiceInstance {
		const existing = instances.get(instance.instanceId);
		const next = existing
			? { ...existing, ...instance, lastHeartbeat: UnixTimestamp.now() }
			: {
					...instance,
					registeredAt: UnixTimestamp.now(),
					lastHeartbeat: UnixTimestamp.now(),
				};
		instances.set(instance.instanceId, next);
		return next;
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
		instance.lastHeartbeat = UnixTimestamp.now();
		return instance.ttl;
	}

	getInstances(serviceName: ServiceInstanceName): ServiceInstance[] {
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

	/** Known service names with an instance, as the Redis store lists them. */
	listServiceNames(): ServiceInstanceName[] {
		return [...ALL_SERVICE_NAMES].filter((name) => this._services.has(name));
	}

	dump(): Partial<Record<ServiceInstanceName, ServiceInstance[]>> {
		const snapshot: Partial<Record<ServiceInstanceName, ServiceInstance[]>> =
			{};
		for (const serviceName of this.listServiceNames()) {
			snapshot[serviceName] = this.getInstances(serviceName);
		}
		return snapshot;
	}
}
