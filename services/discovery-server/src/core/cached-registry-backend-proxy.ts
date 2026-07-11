import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { parseServiceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type {
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";

export class CachedRegistryBackendProxy {
	constructor(private readonly _backend: RegistryBackend) {}

	async updateToken(instanceId: InstanceId): Promise<string> {
		return await this._backend.updateToken(toInstanceId(instanceId));
	}

	async getInstanceCount(serviceName: ServiceInstanceName): Promise<number> {
		const instances = await this._backend.getInstances(
			parseServiceName(serviceName)
		);
		return instances.length;
	}

	async getServiceVersion(serviceName: ServiceInstanceName): Promise<number> {
		const instances = await this._backend.getInstances(
			parseServiceName(serviceName)
		);
		return instances.reduce((max, inst) => {
			const major = Number.parseInt((inst.version ?? "").split(".")[0], 10);
			return Number.isNaN(major) ? max : Math.max(max, major);
		}, 0);
	}

	async listServiceNames(): Promise<ServiceInstanceName[]> {
		return (await this._backend.listServiceNames()) as ServiceInstanceName[];
	}

	async dump(): Promise<Record<ServiceInstanceName, ServiceInstance[]>> {
		return await this._backend.dump();
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return await this._backend.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._backend.generateInstanceToken(toInstanceId(instanceId));
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return this._backend.verifyInstanceName(serviceName);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._backend.generateInstanceId(endpoint);
	}
}
