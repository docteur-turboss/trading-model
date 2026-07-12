import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type {
	IInstanceRegistration,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import type { RedisInstanceRepository } from "./redis-instance-repository";

export class InstanceRegistrationService implements IInstanceRegistration {
	constructor(private readonly _instances: RedisInstanceRepository) {}

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this._instances.registerInstance(instance);
	}

	updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._instances.updateHeartbeat(id);
	}

	removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._instances.removeInstance(id);
	}
}
