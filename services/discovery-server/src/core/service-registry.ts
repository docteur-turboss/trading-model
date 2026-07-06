import { createHmac, randomBytes } from "node:crypto";

import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type { ServiceInstance } from "./types";
import { TokenService } from "./token-service";

export class ServiceRegistry {
	private readonly _tokenService: TokenService;
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();
	private _token: Map<string, string> = new Map();

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
	}

	private _ensureBucket(serviceName: string): Map<string, ServiceInstance> {
		let instances = this._services.get(serviceName);
		if (!instances) {
			instances = new Map();
			this._services.set(serviceName, instances);
		}
		return instances;
	}

	private _mergeOrCreateInstance(
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

	registerInstance(instance: ServiceInstance) {
		const { serviceName, instanceId } = instance;
		const instances = this._ensureBucket(serviceName);
		const token = this._tokenService.generateInstanceToken(instanceId);
		this._mergeOrCreateInstance(instances, instance);
		this._token.set(instanceId, token);
		return { ...instances.get(instanceId)!, token };
	}

	updateHeartbeat(identity: ServiceIdentity): number | false {
		const service = this._services.get(identity.serviceName);
		if (!service) {
			return false;
		}
		const instance = service.get(identity.instanceId);
		if (!instance) {
			return false;
		}
		instance.lastHeartbeat = Date.now();
		service.set(identity.instanceId, instance);
		return instance.ttl;
	}

	updateToken(instanceId: string): string {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return newToken;
	}

	getInstances(serviceName: string): ServiceInstance[] {
		const service = this._services.get(serviceName);
		if (!service) {
			return [];
		}
		return [...service.values()];
	}

	getInstance(identity: ServiceIdentity): ServiceInstance | undefined {
		return this._services.get(identity.serviceName)?.get(identity.instanceId);
	}

	removeInstance(identity: ServiceIdentity): boolean {
		const service = this._services.get(identity.serviceName);
		if (!service) {
			return false;
		}
		const deleted = service.delete(identity.instanceId);
		if (service.size === 0) {
			this._services.delete(identity.serviceName);
		}
		this._token.delete(identity.instanceId);
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

	generateInstanceToken(instanceId: string): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	generateInstanceId({
		serviceName,
		address,
		port,
	}: ServiceEndpoint): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	validInstanceToken({ token, instanceId }: TokenValidation): boolean {
		const storedToken = this._token.get(instanceId);
		return this._tokenService.validInstanceToken(
			token,
			instanceId,
			storedToken
		);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
