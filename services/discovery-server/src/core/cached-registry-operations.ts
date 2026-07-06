import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { BackendPingManager } from "./backend-ping-manager";
import { CacheManager } from "./cache-manager";
import { CacheOrchestrator } from "./cache-orchestrator";
import { PubSubInvalidator } from "./pub-sub-invalidator";
import { RedisHealthMonitor } from "./redis-health-monitor";
import { CachedRegistryBackendProxy } from "./cached-registry-backend-proxy";
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
	private readonly _backend: RegistryBackend;
	private readonly _cache: CacheManager;
	private readonly _pubSub: PubSubInvalidator;
	private readonly _orchestrator: CacheOrchestrator;
	private readonly _healthMonitor: RedisHealthMonitor;
	private readonly _pingManager: BackendPingManager;
	private readonly _proxy: CachedRegistryBackendProxy;
	private readonly _lifecycle: CachedRegistryLifecycle;

	constructor(options: CachedRegistryBackendOptions) {
		this._backend = options.backend;
		this._cache = new CacheManager({
			maxSize: options.maxEntries ?? 5000,
			ttlMs: options.cacheTtlMs,
		});
		this._pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
		this._pingManager = new BackendPingManager(
			this._backend,
			this._pubSub,
			options.redisUrlForPubSub,
		);
		this._healthMonitor = new RedisHealthMonitor({
			failureThreshold: options.redisFailureThreshold ?? 3,
			healthCheckIntervalMs: options.redisHealthCheckIntervalMs ?? 15_000,
			shouldRun: () =>
				!!(options.redisUrlForPubSub || this._pingManager.isRedisBackend()),
			callbacks: {
				ping: () => this._lifecycle.ping(),
				onHealthLost: () => {},
				onHealthRestored: () => {
					this._cache.clear();
				},
				onFallbackActivated: () => {
					this._cache.clear();
				},
				onFallbackRestored: () => {
					this._cache.clear();
				},
			},
			backend: this._backend,
		});
		this._orchestrator = new CacheOrchestrator(
			this._backend,
			this._cache,
			this._healthMonitor,
		);
		this._proxy = new CachedRegistryBackendProxy(this._backend);
		this._lifecycle = new CachedRegistryLifecycle(
			this._healthMonitor,
			this._pingManager,
			this._pubSub,
			this._cache,
			this._backend,
		);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this._orchestrator.refreshCache(instance.serviceName);
		await this._pubSub.publish(instance.serviceName);
		return token;
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		const { serviceName } = id;
		const result = await this._backend.updateHeartbeat(id);
		if (result !== false) {
			await this._orchestrator.refreshCache(serviceName);
			await this._orchestrator.onHeartbeatUpdate(serviceName, (name) =>
				this._pubSub.publish(name),
			);
		}
		return result;
	}

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery,
	): Promise<ServiceInstance[]> {
		return this._orchestrator.getInstances(serviceName, pagination);
	}

	async getInstance(
		id: ServiceIdentity,
	): Promise<ServiceInstance | undefined> {
		return this._orchestrator.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		const { serviceName } = id;
		const result = await this._backend.removeInstance(id);
		await this._orchestrator.refreshCache(serviceName);
		await this._pubSub.publish(serviceName);
		return result;
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

	async validInstanceToken(validation: import("@trading-model/common/domain/token-validation").TokenValidation): Promise<boolean> {
		return this._proxy.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: string): string {
		return this._proxy.generateInstanceToken(instanceId);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._proxy.verifyInstanceName(serviceName);
	}

	generateInstanceId(endpoint: import("@trading-model/common/domain/service-identity").ServiceEndpoint): import("@trading-model/common/domain/primitives").ServiceId {
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
