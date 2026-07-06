import { logger } from "@trading-model/common/config/logger";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
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

export class CachedRegistryBackend implements RegistryBackend {
	private _backend: RegistryBackend;
	private _cache: CacheManager;
	private _pubSub: PubSubInvalidator;
	private readonly _orchestrator: CacheOrchestrator;
	private readonly _healthMonitor: RedisHealthMonitor;
	private readonly _redisUrlForPubSub?: string;

	constructor(options: CachedRegistryBackendOptions) {
		this._backend = options.backend;
		this._redisUrlForPubSub = options.redisUrlForPubSub;
		const failureThreshold = options.redisFailureThreshold ?? 3;
		const healthCheckIntervalMs = options.redisHealthCheckIntervalMs ?? 15_000;
		this._cache = new CacheManager(
			options.maxEntries ?? 5000,
			options.cacheTtlMs
		);
		this._pubSub = new PubSubInvalidator(options.redisUrlForPubSub);

		this._healthMonitor = new RedisHealthMonitor({
			failureThreshold,
			healthCheckIntervalMs,
			shouldRun: () => !!(options.redisUrlForPubSub || this._isRedisBackend()),
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
			this._healthMonitor
		);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this._orchestrator.refreshCache(instance.serviceName);
		await this._pubSub.publish(instance.serviceName);
		return token;
	}

	async updateHeartbeat(
		id: ServiceIdentity
	): Promise<number | false> {
		const { serviceName } = id;
		const result = await this._backend.updateHeartbeat(id);
		if (result !== false) {
			await this._orchestrator.refreshCache(serviceName);
			await this._orchestrator.onHeartbeatUpdate(serviceName, (name) =>
				this._pubSub.publish(name)
			);
		}
		return result;
	}

	async updateToken(instanceId: string): Promise<string> {
		return await this._backend.updateToken(instanceId);
	}

	async getInstanceCount(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(serviceName);
		return instances.length;
	}

	async getInstances(
		serviceName: string,
		offset?: number,
		limit?: number
	): Promise<ServiceInstance[]> {
		return this._orchestrator.getInstances(serviceName, offset, limit);
	}

	async getInstance(
		id: ServiceIdentity
	): Promise<ServiceInstance | undefined> {
		return this._orchestrator.getInstance(id);
	}

	async removeInstance(
		id: ServiceIdentity
	): Promise<boolean> {
		const { serviceName } = id;
		const result = await this._backend.removeInstance(id);
		await this._orchestrator.refreshCache(serviceName);
		await this._pubSub.publish(serviceName);
		return result;
	}

	async getServiceVersion(serviceName: string): Promise<number> {
		const instances = await this._backend.getInstances(serviceName);
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
		token: string,
		instanceId: string
	): Promise<boolean> {
		return await this._backend.validInstanceToken(token, instanceId);
	}

	generateInstanceToken(instanceId: string): string {
		return this._backend.generateInstanceToken(instanceId);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._backend.verifyInstanceName(serviceName);
	}

	generateInstanceId(
		endpoint: ServiceEndpoint
	): string {
		return this._backend.generateInstanceId(endpoint);
	}

	async start(): Promise<void> {
		this._backend.start();

		await this._pubSub.start(this._cache);

		this._healthMonitor.start();
	}

	private _isRedisBackend(): boolean {
		return typeof (this._backend as { ping?: unknown }).ping === "function";
	}

	async ping(): Promise<boolean> {
		if (this._healthMonitor.fallbackActive) {
			return false;
		}

		const pubSubClient = this._pubSub.client;
		if (pubSubClient?.status === "ready") {
			try {
				await pubSubClient.ping();
			} catch {
				logger.warn("PubSub ping failed — cache invalidation degraded");
			}
		}

		const backendWithPing = this._backend as { ping?: () => Promise<boolean> };
		if (typeof backendWithPing.ping === "function") {
			try {
				return await backendWithPing.ping();
			} catch {
				return false;
			}
		}
		if (this._redisUrlForPubSub) {
			return false;
		}
		try {
			await this._backend.listServiceNames();
			return true;
		} catch {
			return false;
		}
	}

	markUnhealthy(): void {
		this._healthMonitor.markUnhealthy();
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		logger.warn(
			"CachedRegistryBackend.setFallbackBackend — swapping to fallback backend"
		);
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
