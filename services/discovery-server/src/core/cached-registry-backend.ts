import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import { CachedRegistryOperations, type CachedRegistryBackendOptions } from "./cached-registry-operations";

export type { CachedRegistryBackendOptions };

export class CachedRegistryBackend implements RegistryBackend {
	private readonly _ops: CachedRegistryOperations;

	constructor(options: CachedRegistryBackendOptions) {
		this._ops = new CachedRegistryOperations(options);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._ops.registerInstance(instance);
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._ops.updateHeartbeat(id);
	}

	async updateToken(instanceId: string): Promise<string> {
		return this._ops.updateToken(instanceId);
	}

	async getInstanceCount(serviceName: string): Promise<number> {
		return this._ops.getInstanceCount(serviceName);
	}

	async getInstances(serviceName: string, pagination?: PaginationQuery): Promise<ServiceInstance[]> {
		return this._ops.getInstances(serviceName, pagination);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._ops.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._ops.removeInstance(id);
	}

	async getServiceVersion(serviceName: string): Promise<number> {
		return this._ops.getServiceVersion(serviceName);
	}

	async listServiceNames(): Promise<string[]> {
		return this._ops.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._ops.dump();
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._ops.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: string): string {
		return this._ops.generateInstanceToken(instanceId);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._ops.verifyInstanceName(serviceName);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._ops.generateInstanceId(endpoint);
	}

	async start(): Promise<void> {
		return this._ops.start();
	}

	async ping(): Promise<boolean> {
		return this._ops.ping();
	}

	markUnhealthy(): void {
		this._ops.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		this._ops.setFallbackBackend(fallback);
	}

	stop(): void {
		this._ops.stop();
	}
}
