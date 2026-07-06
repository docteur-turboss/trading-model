import { createHmac, randomBytes } from "node:crypto";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { TokenService } from "./token-service";

/**
 * InMemoryRegistryBackend
 *
 * Ephemeral, single-node storage for service instances.
 * Data is lost on restart – suitable for development and
 * single-instance deployments.
 *
 * Replaced by RedisRegistryBackend in multi-node / multi-region
 * production deployments.
 */
export class InMemoryRegistryBackend implements RegistryBackend {
	private readonly _tokenService: TokenService;
	private _services: Map<string, Map<string, ServiceInstance>> = new Map();
	private _token: Map<string, string> = new Map();

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
	}

	private _ensureServiceMap(serviceName: string): Map<string, ServiceInstance> {
		let instances = this._services.get(serviceName);
		if (!instances) {
			instances = new Map();
			this._services.set(serviceName, instances);
		}
		return instances;
	}

	private _mergeInstance(existing: ServiceInstance, instance: ServiceInstance): ServiceInstance {
		return { ...existing, ...instance, lastHeartbeat: Date.now() };
	}

	private _createInstance(instance: ServiceInstance): ServiceInstance {
		return { ...instance, registeredAt: Date.now(), lastHeartbeat: Date.now() };
	}

	registerInstance(instance: ServiceInstance): Promise<string> {
		const { serviceName, instanceId } = instance;
		const instances = this._ensureServiceMap(serviceName);
		const token = this._tokenService.generateInstanceToken(instanceId);
		const existing = instances.get(instanceId);
		instances.set(instanceId, existing ? this._mergeInstance(existing, instance) : this._createInstance(instance));
		this._token.set(instanceId, token);
		return Promise.resolve(token);
	}

	updateHeartbeat(
		{ serviceName, instanceId }: ServiceIdentity
	): Promise<number | false> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve(false);
		}

		const instance = service.get(instanceId);
		if (!instance) {
			return Promise.resolve(false);
		}

		instance.lastHeartbeat = Date.now();
		service.set(instanceId, instance);
		return Promise.resolve(instance.ttl);
	}

	updateToken(instanceId: string): Promise<string> {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return Promise.resolve(newToken);
	}

	getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve([]);
		}
		return Promise.resolve([...service.values()]);
	}

	getInstance({ serviceName, instanceId }: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return Promise.resolve(this._services.get(serviceName)?.get(instanceId));
	}

	removeInstance({ serviceName, instanceId }: ServiceIdentity): Promise<boolean> {
		const service = this._services.get(serviceName);
		if (!service) {
			return Promise.resolve(false);
		}

		const deleted = service.delete(instanceId);

		if (service.size === 0) {
			this._services.delete(serviceName);
		}

		this._token.delete(instanceId);
		return Promise.resolve(deleted);
	}

	listServiceNames(): Promise<string[]> {
		return Promise.resolve([...this._services.keys()]);
	}

	dump(): Promise<Record<string, ServiceInstance[]>> {
		const snapshot: Record<string, ServiceInstance[]> = {};
		for (const [serviceName, instances] of this._services.entries()) {
			snapshot[serviceName] = [...instances.values()];
		}
		return Promise.resolve(snapshot);
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

	validInstanceToken(token: string, instanceId: string): Promise<boolean> {
		const storedToken = this._token.get(instanceId);
		return Promise.resolve(
			this._tokenService.validInstanceToken(token, instanceId, storedToken)
		);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}

	start(): void {
		// no-op for in-memory backend
	}

	stop(): void {
		// no-op for in-memory backend
	}
}
