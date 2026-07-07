import type { ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { RedisDeps } from "./redis-deps";
import { RedisInstanceStore } from "./redis-instance-store";

export class RedisInstanceRepository {
	private readonly _store: RedisInstanceStore;
	private readonly _deps: RedisDeps;

	constructor(deps: RedisDeps) {
		this._deps = deps;
		this._store = new RedisInstanceStore(deps);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._store.registerInstance(instance);
	}

	async updateHeartbeat({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<number | false> {
		return this._store.updateHeartbeat(serviceName, instanceId);
	}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const instanceIds = await this._store.getServiceInstanceIds(serviceName);

		if (instanceIds.length === 0) {
			return [];
		}

		const keys = instanceIds.map((id) =>
			this._deps.keyBuilder.instanceMetadata(id)
		);
		return this._store.getMetadatas(keys);
	}

	async getInstance({
		instanceId,
	}: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._store.getMetadata(instanceId);
	}

	async removeInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<boolean> {
		return this._store.removeInstanceSetAndMetadata(serviceName, instanceId);
	}

	async listServiceNames(): Promise<string[]> {
		return this._store.listServiceNames();
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
