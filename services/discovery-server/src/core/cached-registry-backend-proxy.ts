import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { toInstanceId } from "@trading-model/common/domain/primitives";

export class CachedRegistryBackendProxy {
	constructor(private readonly _backend: RegistryBackend) {}

	async updateToken(instanceId: string): Promise<string> {
		return await this._backend.updateToken(toInstanceId(instanceId));
	}

	async getInstanceCount(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(serviceName as ServiceInstanceName);
		return instances.length;
	}

	async getServiceVersion(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(serviceName as ServiceInstanceName);
		return instances.reduce((max, inst) => {
			const major = Number.parseInt((inst.version ?? "").split(".")[0], 10);
			return Number.isNaN(major) ? max : Math.max(max, major);
		}, 0);
	}

	async listServiceNames(): Promise<string[]> {
		return await this._backend.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return await this._backend.dump();
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return await this._backend.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: string): string {
		return this._backend.generateInstanceToken(toInstanceId(instanceId));
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._backend.verifyInstanceName(serviceName as ServiceInstanceName);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._backend.generateInstanceId(endpoint);
	}
}
