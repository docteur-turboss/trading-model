import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "./types";

export interface IInstanceStore {
	registerInstance(
		instance: ServiceInstance
	): ServiceInstance | Promise<string>;
	updateHeartbeat(
		identity: ServiceIdentity
	): number | false | Promise<number | false>;
	getInstances(
		serviceName: ServiceInstanceName
	): ServiceInstance[] | Promise<ServiceInstance[]>;
	getInstance(
		identity: ServiceIdentity
	): ServiceInstance | undefined | Promise<ServiceInstance | undefined>;
	removeInstance(identity: ServiceIdentity): boolean | Promise<boolean>;
	listServiceNames(): ServiceInstanceName[] | Promise<ServiceInstanceName[]>;
	dump():
		| Partial<Record<ServiceInstanceName, ServiceInstance[]>>
		| Promise<Record<ServiceInstanceName, ServiceInstance[]>>;
}
