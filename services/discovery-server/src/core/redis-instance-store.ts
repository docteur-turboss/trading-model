import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "@trading-model/validation/contracts/service-registry.types";
import { removeInstanceSetAndMetadata } from "./instance-cleanup-handler";
import { InstanceHeartbeatHandler } from "./instance-heartbeat-handler";
import { InstanceMetadataReader } from "./instance-metadata-reader";
import { InstanceRegistrar } from "./instance-registrar";
import type { IInstanceStore } from "./instance-store.interface";
import type { RedisDeps } from "./redis-deps";
import { instanceMetadata } from "./redis-key-builder";

/**
 * Redis-backed server-side registry of discovered service instances.
 *
 * CRUD pattern:
 *   - Create: `registerInstance(instance)`
 *   - Read:   `getMetadata(instanceId)`, `getServiceInstanceIds(serviceName)`, `getMetadatas(keys)`, `listServiceNames()`
 *   - Update: `updateHeartbeat(serviceName, instanceId)`
 *   - Delete: `removeInstanceSetAndMetadata(identity)`
 *
 * @see InstanceStore — in-memory counterpart
 * @see CacheStore — client-side cache (address-manager)
 */
export class RedisInstanceStore implements IInstanceStore {
	public readonly reader: InstanceMetadataReader;
	public readonly registrar: InstanceRegistrar;
	public readonly heartbeatHandler: InstanceHeartbeatHandler;
	public readonly deps: RedisDeps;

	constructor(deps: RedisDeps) {
		const { redis, keyPrefix } = deps;
		this.deps = deps;
		this.reader = new InstanceMetadataReader({ redis, keyPrefix });
		this.registrar = new InstanceRegistrar(deps);
		this.heartbeatHandler = new InstanceHeartbeatHandler(
			{ redis, keyPrefix },
			this.reader
		);
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this.registrar.registerInstance(instance);
	}

	updateHeartbeat(identity: ServiceIdentity): Promise<number | false> {
		return this.heartbeatHandler.updateHeartbeat(identity);
	}

	listServiceNames(): Promise<ServiceInstanceName[]> {
		return this.reader.listServiceNames() as Promise<ServiceInstanceName[]>;
	}

	getInstance({
		instanceId,
	}: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this.reader.getMetadata(instanceId);
	}

	async getInstances(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		const instanceIds = await this.reader.getServiceInstanceIds(serviceName);
		if (instanceIds.length === 0) {
			return [];
		}
		const keys = instanceIds.map((id) =>
			instanceMetadata(this.deps.keyPrefix, InstanceId.of(id))
		);
		return this.reader.getMetadatas(keys);
	}

	removeInstanceSetAndMetadata(identity: ServiceIdentity): Promise<boolean> {
		return removeInstanceSetAndMetadata(
			{ redis: this.deps.redis, keyPrefix: this.deps.keyPrefix },
			identity
		);
	}

	removeInstance(identity: ServiceIdentity): Promise<boolean> {
		return this.removeInstanceSetAndMetadata(identity);
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		const serviceNames = await this.reader.listServiceNames();
		const snapshot: Record<string, ServiceInstance[]> = {};
		for (const name of serviceNames) {
			snapshot[name as ServiceInstanceName] = await this.getInstances(
				name as ServiceInstanceName
			);
		}
		return snapshot;
	}
}
