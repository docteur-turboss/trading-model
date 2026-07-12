import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type {
	IInstanceQuery,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import type { RedisInstanceRepository } from "./redis-instance-repository";

export class InstanceQueryService implements IInstanceQuery {
	constructor(private readonly _instances: RedisInstanceRepository) {}

	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]> {
		return this._instances.getInstances(serviceName);
	}

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._instances.getInstance(id);
	}

	listServiceNames(): Promise<ServiceInstanceName[]> {
		return this._instances.listServiceNames();
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._instances.dump();
	}
}
