import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { InstanceCleanupHandler } from "./instance-cleanup-handler";
import { InstanceHeartbeatHandler } from "./instance-heartbeat-handler";
import { InstanceMetadataReader } from "./instance-metadata-reader";
import { InstanceRegistrar } from "./instance-registrar";
import type { RedisDeps } from "./redis-deps";

/**
 * Redis-backed server-side registry of discovered service instances.
 *
 * CRUD pattern:
 *   - Create: `registerInstance(instance)`
 *   - Read:   `getMetadata(instanceId)`, `getServiceInstanceIds(serviceName)`, `getMetadatas(keys)`, `listServiceNames()`
 *   - Update: `updateHeartbeat(serviceName, instanceId)`
 *   - Delete: `removeInstanceSetAndMetadata(serviceName, instanceId)`
 *
 * @see InstanceStore — in-memory counterpart
 * @see CacheStore — client-side cache (address-manager)
 */
export class RedisInstanceStore {
	private readonly _reader: InstanceMetadataReader;
	private readonly _registrar: InstanceRegistrar;
	private readonly _heartbeatHandler: InstanceHeartbeatHandler;
	private readonly _cleanupHandler: InstanceCleanupHandler;

	constructor(readonly _deps: RedisDeps) {
		const { redis, keyBuilder } = _deps;
		this._reader = new InstanceMetadataReader({ redis, keyBuilder });
		this._registrar = new InstanceRegistrar(_deps);
		this._heartbeatHandler = new InstanceHeartbeatHandler(
			{ redis, keyBuilder },
			this._reader
		);
		this._cleanupHandler = new InstanceCleanupHandler({ redis, keyBuilder });
	}

	resolveToken(instanceId: string): Promise<string> {
		return this._registrar.resolveToken(instanceId);
	}

	buildStoredInstance(
		instance: ServiceInstance,
		now: number
	): Promise<ServiceInstance> {
		return this._registrar.buildStoredInstance(instance, now);
	}

	getMetadata(instanceId: string): Promise<ServiceInstance | undefined> {
		return this._reader.getMetadata(instanceId);
	}

	getServiceInstanceIds(serviceName: string): Promise<string[]> {
		return this._reader.getServiceInstanceIds(serviceName);
	}

	getMetadatas(keys: string[]): Promise<ServiceInstance[]> {
		return this._reader.getMetadatas(keys);
	}

	getInstance({
		instanceId,
	}: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this.getMetadata(instanceId);
	}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const instanceIds = await this.getServiceInstanceIds(serviceName);
		if (instanceIds.length === 0) {
			return [];
		}
		const keys = instanceIds.map((id) =>
			this._deps.keyBuilder.instanceMetadata(id)
		);
		return this.getMetadatas(keys);
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this._registrar.registerInstance(instance);
	}

	updateHeartbeat(identity: ServiceIdentity): Promise<number | false> {
		return this._heartbeatHandler.updateHeartbeat(identity);
	}

	removeInstanceSetAndMetadata(
		serviceName: string,
		instanceId: string
	): Promise<boolean> {
		return this._cleanupHandler.removeInstanceSetAndMetadata(
			serviceName,
			instanceId
		);
	}

	removeInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<boolean> {
		return this.removeInstanceSetAndMetadata(serviceName, instanceId);
	}

	listServiceNames(): Promise<string[]> {
		return this._reader.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		const serviceNames = await this.listServiceNames();
		const snapshot: Record<string, ServiceInstance[]> = {};
		for (const name of serviceNames) {
			snapshot[name] = await this.getInstances(name);
		}
		return snapshot;
	}
}
