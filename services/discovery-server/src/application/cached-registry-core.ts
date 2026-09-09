import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { DurationMs } from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/validation/adapters/outbound/service-registry.types";
import { BackendPingManager } from "../infrastructure/backend-ping-manager";
import { CacheManager } from "../infrastructure/cache-manager";
import { PubSubInvalidator } from "../infrastructure/pub-sub-invalidator";
import { RedisHealthMonitor } from "../infrastructure/redis-health-monitor";
import { CacheOrchestrator } from "./cache-orchestrator";
export interface CachedRegistryBackendOptions {
	backend: RegistryBackend;
	cacheTtlMs: number;
	redisUrlForPubSub?: string;
	maxEntries?: number;
	redisFailureThreshold?: number;
	redisHealthCheckIntervalMs?: number;
}
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
			ttlMs: DurationMs.of(options.cacheTtlMs),
		});
		this.pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
		this.pingManager = this._buildPingManager(options);
		this.healthMonitor = this._buildHealthMonitor(options);
		this.orchestrator = new CacheOrchestrator(
			this._backend,
			this.cache,
			this.healthMonitor
		);
	}
	private _buildPingManager(
		options: CachedRegistryBackendOptions
	): BackendPingManager {
		return new BackendPingManager(
			options.backend,
			this.pubSub,
			Boolean(options.redisUrlForPubSub)
		);
	}
	private _buildHealthMonitor(
		options: CachedRegistryBackendOptions
	): RedisHealthMonitor {
		return new RedisHealthMonitor({
			failureThreshold: options.redisFailureThreshold ?? 3,
			healthCheckIntervalMs: DurationMs.of(
				options.redisHealthCheckIntervalMs ?? 15_000
			),
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
