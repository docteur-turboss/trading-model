import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type InstanceId,
	type ServiceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type {
	IInstanceQuery,
	IInstanceRegistration,
	ILifecycle,
	ITokenManager,
	ServiceInstance,
} from "@trading-model/validation/contracts/service-registry.types";
import { ServiceRegistry } from "./service-registry";

/**
 * InMemoryRegistryBackend
 *
 * Ephemeral, single-node storage for service instances.
 * Data is lost on restart – suitable for development and
 * single-instance deployments.
 *
 * Replaced by RedisRegistryBackend in multi-node / multi-region
 * production deployments.
 *
 * Delegates all storage to ServiceRegistry to avoid duplicating
 * the in-memory map logic.
 */
export class InMemoryRegistryBackend
	implements IInstanceRegistration, IInstanceQuery, ITokenManager, ILifecycle
{
	private readonly _registry: ServiceRegistry;

	constructor(signingSecret?: string) {
		this._registry = new ServiceRegistry(signingSecret);
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		const result = this._registry.registerInstance(instance);
		return Promise.resolve(result.token);
	}

	updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return Promise.resolve(this._registry.updateHeartbeat(id));
	}

	updateToken(instanceId: InstanceId): Promise<string> {
		return Promise.resolve(this._registry.updateToken(instanceId));
	}

	getInstances(serviceName: ServiceInstanceName): Promise<ServiceInstance[]> {
		return Promise.resolve(this._registry.getInstances(serviceName));
	}

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return Promise.resolve(this._registry.getInstance(id));
	}

	removeInstance(id: ServiceIdentity): Promise<boolean> {
		return Promise.resolve(this._registry.removeInstance(id));
	}

	listServiceNames(): Promise<ServiceInstanceName[]> {
		return Promise.resolve(this._registry.listServiceNames());
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		return Promise.resolve(this._registry.dump());
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._registry.generateInstanceToken(instanceId);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return toServiceId(this._registry.generateInstanceId(endpoint));
	}

	validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return Promise.resolve(this._registry.validInstanceToken(validation));
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return this._registry.verifyInstanceName(serviceName);
	}

	/** In-memory backend has no lifecycle to manage. */
	start(): void {}

	/** In-memory backend has no lifecycle to manage. */
	stop(): void {}
}
