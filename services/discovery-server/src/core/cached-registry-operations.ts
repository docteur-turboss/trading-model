import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { PaginationQuery } from "@trading-model/common/domain/pagination";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import {
	toInstanceId,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import { BackendPingManager } from "./backend-ping-manager";
import { CacheManager } from "./cache-manager";
import { CacheOrchestrator } from "./cache-orchestrator";
import { PubSubInvalidator } from "./pub-sub-invalidator";
import { RedisHealthMonitor } from "./redis-health-monitor";

export interface CachedRegistryBackendOptions {
	backend: RegistryBackend;
	cacheTtlMs: number;
	redisUrlForPubSub?: string;
	maxEntries?: number;
	redisFailureThreshold?: number;
	redisHealthCheckIntervalMs?: number;
}

export class CachedRegistryOperations implements RegistryBackend {
	private _backend: RegistryBackend;
	private _cache: CacheManager;
	private _pubSub: PubSubInvalidator;
	private readonly _orchestrator: CacheOrchestrator;
	private readonly _healthMonitor: RedisHealthMonitor;
	private readonly _pingManager: BackendPingManager;

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
				ping: () => this.ping(),
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

	async updateToken(instanceId: string): Promise<string> {
		return await this._backend.updateToken(toInstanceId(instanceId));
	}

	async getInstanceCount(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(
			serviceName as ServiceInstanceName,
		);
		return instances.length;
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

	async getServiceVersion(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(
			serviceName as ServiceInstanceName,
		);
		return instances.reduce((max, inst) => {
			const major = Number.parseInt((inst.version ?? "").split(".")[0], 10);
			return Number.isNaN(major) ? max : Math.max(max, major);
		}, 0);
	}

	async listServiceNames(): Promise<string[]> {
		return await this._backend.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return await this._backend.dump();
	}

	async validInstanceToken(
		validation: TokenValidation,
	): Promise<boolean> {
		return await this._backend.validInstanceToken(validation);
	}

	generateInstanceToken(instanceId: string): string {
		return this._backend.generateInstanceToken(toInstanceId(instanceId));
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._backend.verifyInstanceName(
			serviceName as ServiceInstanceName,
		);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._backend.generateInstanceId(endpoint);
	}

	async start(): Promise<void> {
		this._backend.start();

		await this._pubSub.start(this._cache);

		this._healthMonitor.start();
	}

	async ping(): Promise<boolean> {
		if (this._healthMonitor.fallbackActive) return false;
		await this._pingManager.pingPubSub();
		return this._pingManager.pingBackend();
	}

	markUnhealthy(): void {
		this._healthMonitor.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		this._healthMonitor.setFallbackBackend(fallback);
		this._cache.clear();
	}

	stop(): void {
		this._healthMonitor.stop();
		this._cache.clear();
		this._pubSub.stop();
		this._healthMonitor.stopBackend();
	}
}
