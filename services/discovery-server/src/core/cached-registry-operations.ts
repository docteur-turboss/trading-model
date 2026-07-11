import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	IInstanceQuery,
	IInstanceRegistration,
	ILifecycle,
	ITokenManager,
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type {
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
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

export class CachedRegistryOperations
	implements IInstanceRegistration, IInstanceQuery, ITokenManager, ILifecycle
{
	private readonly _core: CachedRegistryCore;
	private readonly _proxy: CachedRegistryBackendProxy;
	private readonly _lifecycle: CachedRegistryLifecycle;

	constructor(options: CachedRegistryBackendOptions) {
		this._core = new CachedRegistryCore(options);
		this._proxy = new CachedRegistryBackendProxy(options.backend);
		this._lifecycle = new CachedRegistryLifecycle({
			healthMonitor: this._core.healthMonitor,
			pingManager: this._core.pingManager,
			pubSub: this._core.pubSub,
			cache: this._core.cache,
			backend: options.backend,
		});
	}

	// ── IInstanceRegistration ──────────────────────────────────────────

	registerInstance(instance: ServiceInstance): Promise<string> {
		return this._core.registerInstance(instance);
	}

	updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._core.updateHeartbeat(id);
	}

	removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._core.removeInstance(id);
	}

	// ── IInstanceQuery ─────────────────────────────────────────────────

	getInstances(
		serviceName: ServiceInstanceName,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this._core.getInstances(serviceName, pagination);
	}

	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._core.getInstance(id);
	}

	listServiceNames(): Promise<ServiceInstanceName[]> {
		return this._proxy.listServiceNames();
	}

	dump(): Promise<Record<ServiceInstanceName, ServiceInstance[]>> {
		return this._proxy.dump();
	}

	// ── ITokenManager ──────────────────────────────────────────────────

	updateToken(instanceId: InstanceId): Promise<string> {
		return this._proxy.updateToken(instanceId);
	}

	validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._proxy.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._proxy.generateInstanceToken(instanceId);
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
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
