import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { BackendPingManager } from "./backend-ping-manager";
import { CacheManager } from "./cache-manager";
import { CacheOrchestrator } from "./cache-orchestrator";
import type { CachedRegistryBackendOptions } from "./cached-registry-operations";
import { PubSubInvalidator } from "./pub-sub-invalidator";
import { RedisHealthMonitor } from "./redis-health-monitor";

export class CachedRegistryCore {
	readonly cache: CacheManager;
	readonly pubSub: PubSubInvalidator;
	readonly pingManager: BackendPingManager;
	readonly healthMonitor: RedisHealthMonitor;
	readonly orchestrator: CacheOrchestrator;
	private readonly _backend: RegistryBackend;

	constructor(options: CachedRegistryBackendOptions) {
		this._backend = options.backend;
		this.cache = new CacheManager({
			maxSize: options.maxEntries ?? 5000,
			ttlMs: options.cacheTtlMs,
		});
		this.pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
		this.pingManager = new BackendPingManager(
			options.backend,
			this.pubSub,
			Boolean(options.redisUrlForPubSub)
		);
		this.healthMonitor = new RedisHealthMonitor({
			failureThreshold: options.redisFailureThreshold ?? 3,
			healthCheckIntervalMs: options.redisHealthCheckIntervalMs ?? 15_000,
			shouldRun: () =>
				Boolean(options.redisUrlForPubSub || this.pingManager.isRedisBackend()),
			callbacks: {
				ping: () => this._directPing(),
				onHealthLost: () => {},
				onHealthRestored: () => {
					this.cache.clear();
				},
				onFallbackActivated: () => {
					this.cache.clear();
				},
				onFallbackRestored: () => {
					this.cache.clear();
				},
			},
			backend: this._backend,
		});
		this.orchestrator = new CacheOrchestrator(
			this._backend,
			this.cache,
			this.healthMonitor
		);
	}

	private async _directPing(): Promise<boolean> {
		if (this.healthMonitor.fallbackActive) {
			return false;
		}
		await this.pingManager.pingPubSub();
		return this.pingManager.pingBackend();
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this.orchestrator.refreshCache(
			instance.serviceName as unknown as ServiceInstanceName
		);
		await this.pubSub.publish(
			instance.serviceName as unknown as ServiceInstanceName
		);
		return token;
	}
	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		const { serviceName } = id;
		const result = await this._backend.updateHeartbeat(id);
		if (result !== false) {
			await this.orchestrator.refreshCache(
				serviceName as unknown as ServiceInstanceName
			);
			await this.orchestrator.onHeartbeatUpdate(
				serviceName as unknown as ServiceInstanceName,
				(name) => this.pubSub.publish(name)
			);
		}
		return result;
	}
	getInstances(
		serviceName: ServiceInstanceName,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this.orchestrator.getInstances(serviceName, pagination);
	}
	getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this.orchestrator.getInstance(id);
	}
	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		const { serviceName } = id;
		const result = await this._backend.removeInstance(id);
		await this.orchestrator.refreshCache(
			serviceName as unknown as ServiceInstanceName
		);
		await this.pubSub.publish(serviceName as unknown as ServiceInstanceName);
		return result;
	}
}
