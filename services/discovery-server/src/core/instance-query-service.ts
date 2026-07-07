import type {
	IInstanceQuery,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { RedisInstanceRepository } from "./redis-instance-repository";

export class InstanceQueryService implements IInstanceQuery {
	constructor(private readonly _instances: RedisInstanceRepository) {}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		return this._instances.getInstances(serviceName);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._instances.getInstance(id);
	}

	async listServiceNames(): Promise<string[]> {
		return this._instances.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._instances.dump();
	}
}
