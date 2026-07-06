import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { CachedRegistryBackendProxy } from "./cached-registry-backend-proxy";
import { CachedRegistryCore } from "./cached-registry-core";
import { CachedRegistryLifecycle } from "./cached-registry-lifecycle";

export interface CachedRegistryBackendOptions {
	backend: RegistryBackend;
	cacheTtlMs: number;
	redisUrlForPubSub?: string;
	maxEntries?: number;
	redisFailureThreshold?: number;
	redisHealthCheckIntervalMs?: number;
}

export class CachedRegistryOperations implements RegistryBackend {
	private readonly _core: CachedRegistryCore;
	private readonly _proxy: CachedRegistryBackendProxy;
	private readonly _lifecycle: CachedRegistryLifecycle;

	constructor(options: CachedRegistryBackendOptions) {
		this._core = new CachedRegistryCore(options);
		this._proxy = new CachedRegistryBackendProxy(options.backend);
		this._lifecycle = new CachedRegistryLifecycle(
			this._core.healthMonitor,
			this._core.pingManager,
			this._core.pubSub,
			this._core.cache,
			options.backend
		);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._core.registerInstance(instance);
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._core.updateHeartbeat(id);
	}

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this._core.getInstances(serviceName, pagination);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._core.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._core.removeInstance(id);
	}

	async updateToken(instanceId: string): Promise<string> {
		return this._proxy.updateToken(instanceId);
	}

	async getInstanceCount(serviceName: string): Promise<number> {
		return this._proxy.getInstanceCount(serviceName);
	}

	async getServiceVersion(serviceName: string): Promise<number> {
		return this._proxy.getServiceVersion(serviceName);
	}

	async listServiceNames(): Promise<string[]> {
		return this._proxy.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._proxy.dump();
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._proxy.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: string): string {
		return this._proxy.generateInstanceToken(instanceId);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._proxy.verifyInstanceName(serviceName);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._proxy.generateInstanceId(endpoint);
	}

	async start(): Promise<void> {
		await this._lifecycle.start();
	}

	async ping(): Promise<boolean> {
		return this._lifecycle.ping();
	}

	markUnhealthy(): void {
		this._lifecycle.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		this._lifecycle.setFallbackBackend(fallback);
	}

	stop(): void {
		this._lifecycle.stop();
	}
}
