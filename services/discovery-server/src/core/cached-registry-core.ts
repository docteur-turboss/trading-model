import type { RegistryBackend, ServiceInstance } from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { CacheManager } from "./cache-manager";
import { CacheOrchestrator } from "./cache-orchestrator";
import { PubSubInvalidator } from "./pub-sub-invalidator";
import { RedisHealthMonitor } from "./redis-health-monitor";
import { CachedRegistryLifecycle } from "./cached-registry-lifecycle";
import type { CachedRegistryBackendOptions } from "./cached-registry-operations";

export class CachedRegistryCore {
	private readonly _backend: RegistryBackend;
	private readonly _cache: CacheManager;
	private readonly _pubSub: PubSubInvalidator;
	private readonly _orchestrator: CacheOrchestrator;
	private readonly _healthMonitor: RedisHealthMonitor;
	private readonly _lifecycle: CachedRegistryLifecycle;

	constructor(options: CachedRegistryBackendOptions, lifecycle: CachedRegistryLifecycle) {
		this._backend = options.backend;
		this._cache = new CacheManager({
			maxSize: options.maxEntries ?? 5000,
			ttlMs: options.cacheTtlMs,
		});
		this._pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
		this._healthMonitor = new RedisHealthMonitor({
			failureThreshold: options.redisFailureThreshold ?? 3,
			healthCheckIntervalMs: options.redisHealthCheckIntervalMs ?? 15_000,
			shouldRun: () =>
				!!(options.redisUrlForPubSub || false),
			callbacks: {
				ping: () => lifecycle.ping(),
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
		this._lifecycle = lifecycle;
	}

	get cache(): CacheManager { return this._cache; }

	get healthMonitor(): RedisHealthMonitor { return this._healthMonitor; }

	get orchestrator(): CacheOrchestrator { return this._orchestrator; }

	get pubSub(): PubSubInvalidator { return this._pubSub; }

	get backend(): RegistryBackend { return this._backend; }

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
}
