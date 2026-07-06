import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { ServiceInstance } from "./types";
import { TokenService } from "./token-service";

export class RegistryStore {
	private readonly _tokenService: TokenService;
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();
	private _token: Map<string, string> = new Map();

	constructor(tokenService: TokenService) {
		this._tokenService = tokenService;
	}

	ensureBucket(serviceName: string): Map<string, ServiceInstance> {
		if (!this._services.has(serviceName)) {
			this._services.set(serviceName, new Map());
		}
		return this._services.get(serviceName)!;
	}

	mergeOrCreateInstance(
		instances: Map<string, ServiceInstance>,
		instance: ServiceInstance
	): ServiceInstance {
		const { instanceId } = instance;
		if (instances.has(instanceId)) {
			const existing = instances.get(instanceId)!;
			instances.set(instanceId, {
				...existing,
				...instance,
				lastHeartbeat: Date.now(),
			});
		} else {
			instances.set(instanceId, {
				...instance,
				registeredAt: Date.now(),
				lastHeartbeat: Date.now(),
			});
		}
		return instances.get(instanceId)!;
	}

	registerInstance(
		instance: ServiceInstance
	): { instance: ServiceInstance; token: string } {
		const { serviceName, instanceId } = instance;
		const instances = this.ensureBucket(serviceName);
		const token = this._tokenService.generateInstanceToken(instanceId);

		this.mergeOrCreateInstance(instances, instance);
		this._token.set(instanceId, token);

		return { instance: instances.get(instanceId)!, token };
	}

	updateHeartbeat({ serviceName, instanceId }: ServiceIdentity): number | false {
		const service = this._services.get(serviceName);
		if (!service) {
			return false;
		}

		const instance = service.get(instanceId);
		if (!instance) {
			return false;
		}

		instance.lastHeartbeat = Date.now();
		service.set(instanceId, instance);

		return instance.ttl;
	}

	getInstances(serviceName: string): ServiceInstance[] {
		const service = this._services.get(serviceName);
		if (!service) {
			return [];
		}
		return [...service.values()];
	}

	getInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): ServiceInstance | undefined {
		return this._services.get(serviceName)?.get(instanceId);
	}

	removeInstance({ serviceName, instanceId }: ServiceIdentity): boolean {
		const service = this._services.get(serviceName);
		if (!service) {
			return false;
		}

		const deleted = service.delete(instanceId);

		if (service.size === 0) {
			this._services.delete(serviceName);
		}

		this._token.delete(instanceId);

		return deleted;
	}

	listServiceNames(): string[] {
		return [...this._services.keys()];
	}

	dump(): Record<string, ServiceInstance[]> {
		const snapshot: Record<string, ServiceInstance[]> = {};

		for (const [serviceName, instances] of this._services.entries()) {
			snapshot[serviceName] = [...instances.values()];
		}

		return snapshot;
	}

	storeToken(instanceId: string, token: string): void {
		this._token.set(instanceId, token);
	}

	getStoredToken(instanceId: string): string | undefined {
		return this._token.get(instanceId);
	}

	deleteToken(instanceId: string): void {
		this._token.delete(instanceId);
	}
}
