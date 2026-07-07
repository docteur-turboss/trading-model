import type {
	IInstanceQuery,
	IInstanceRegistration,
	ILifecycle,
	ITokenManager,
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
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

export class CachedRegistryOperations
	implements IInstanceRegistration, IInstanceQuery, ITokenManager, ILifecycle
{
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

	// ── IInstanceRegistration ──────────────────────────────────────────

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._core.registerInstance(instance);
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._core.updateHeartbeat(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._core.removeInstance(id);
	}

	// ── IInstanceQuery ─────────────────────────────────────────────────

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this._core.getInstances(serviceName, pagination);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._core.getInstance(id);
	}

	async listServiceNames(): Promise<string[]> {
		return this._proxy.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._proxy.dump();
	}

	// ── ITokenManager ──────────────────────────────────────────────────

	async updateToken(instanceId: string): Promise<string> {
		return this._proxy.updateToken(instanceId);
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

	// ── ILifecycle ─────────────────────────────────────────────────────

	async start(): Promise<void> {
		await this._lifecycle.start();
	}

	stop(): void {
		this._lifecycle.stop();
	}
}
