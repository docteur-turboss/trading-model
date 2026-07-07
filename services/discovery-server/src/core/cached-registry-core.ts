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
		this.cache = this._createCache(options);
		this.pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
		this.pingManager = this._createPingManager(options);
		this.healthMonitor = this._createHealthMonitor(options);
		this.orchestrator = new CacheOrchestrator(
			this._backend,
			this.cache,
			this.healthMonitor
		);
	}

	private _createCache(options: CachedRegistryBackendOptions): CacheManager {
		return new CacheManager({
			maxSize: options.maxEntries ?? 5000,
			ttlMs: options.cacheTtlMs,
		});
	}

	private _createPingManager(
		options: CachedRegistryBackendOptions
	): BackendPingManager {
		return new BackendPingManager(
			options.backend,
			this.pubSub,
			Boolean(options.redisUrlForPubSub)
		);
	}

	private _createHealthMonitor(
		options: CachedRegistryBackendOptions
	): RedisHealthMonitor {
		return new RedisHealthMonitor({
			failureThreshold: options.redisFailureThreshold ?? 3,
			healthCheckIntervalMs: options.redisHealthCheckIntervalMs ?? 15_000,
			shouldRun: () =>
				Boolean(options.redisUrlForPubSub || this.pingManager.isRedisBackend()),
			callbacks: this._buildHealthCallbacks(),
			backend: this._backend,
		});
	}

	private _buildHealthCallbacks() {
		return {
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
		};
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
		await this.orchestrator.refreshCache(instance.serviceName);
		await this.pubSub.publish(instance.serviceName);
		return token;
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		const { serviceName } = id;
		const result = await this._backend.updateHeartbeat(id);
		if (result !== false) {
			await this.orchestrator.refreshCache(serviceName);
			await this.orchestrator.onHeartbeatUpdate(serviceName, (name) =>
				this.pubSub.publish(name)
			);
		}
		return result;
	}

	async getInstances(
		serviceName: string,
		pagination?: PaginationQuery
	): Promise<ServiceInstance[]> {
		return this.orchestrator.getInstances(serviceName, pagination);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this.orchestrator.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		const { serviceName } = id;
		const result = await this._backend.removeInstance(id);
		await this.orchestrator.refreshCache(serviceName);
		await this.pubSub.publish(serviceName);
		return result;
	}
}
