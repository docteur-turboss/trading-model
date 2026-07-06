import { createHmac, randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { CacheManager } from "./cache-manager";
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
	private readonly _heartbeatInvalidationThrottleMs = 5000;
	private _lastHeartbeatInvalidation = new Map<string, number>();
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

		this._healthMonitor = new RedisHealthMonitor(
			failureThreshold,
			healthCheckIntervalMs,
			() => !!(options.redisUrlForPubSub || this._isRedisBackend()),
			{
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
			this._backend
		);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this._refreshCache(instance.serviceName);
		await this._pubSub.publish(instance.serviceName);
		return token;
	}

	async updateHeartbeat(
		id: ServiceIdentity
	): Promise<number | false> {
		const { serviceName } = id;
		const result = await this._backend.updateHeartbeat(id);
		if (result !== false) {
			await this._refreshCache(serviceName);
			const now = Date.now();
			const last = this._lastHeartbeatInvalidation.get(serviceName) ?? 0;
			if (now - last >= this._heartbeatInvalidationThrottleMs) {
				this._lastHeartbeatInvalidation.set(serviceName, now);
				await this._pubSub.publish(serviceName);
			}
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
		if (offset !== undefined || limit !== undefined) {
			const all = await this._backend.getInstances(serviceName);
			const start = offset ?? 0;
			return all.slice(start, limit === undefined ? undefined : start + limit);
		}

		if (this._healthMonitor.fallbackActive) {
			return this._backend.getInstances(serviceName);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached;
		}

		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) {
				logger.warn(
					"Backend unhealthy — serving stale cached instance list for",
					{ serviceName }
				);
				return stale;
			}
			logger.warn(
				"Backend unhealthy — no stale data available, returning empty list for",
				{ serviceName }
			);
			return [];
		}

		const instances = await this._backend.getInstances(serviceName);
		this._cache.set(serviceName, instances);
		return instances;
	}

	async getInstance(
		id: ServiceIdentity
	): Promise<ServiceInstance | undefined> {
		const { serviceName, instanceId } = id;
		if (this._healthMonitor.fallbackActive) {
			return await this._backend.getInstance(id);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached.find(
				(inst: ServiceInstance) => inst.instanceId === instanceId
			);
		}
		if (!this._healthMonitor.isHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) {
				return stale.find(
					(inst: ServiceInstance) => inst.instanceId === instanceId
				);
			}
		}
		return await this._backend.getInstance(id);
	}

	async removeInstance(
		id: ServiceIdentity
	): Promise<boolean> {
		const { serviceName } = id;
		const result = await this._backend.removeInstance(id);
		await this._refreshCache(serviceName);
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
		serviceName: string,
		address: string,
		port: number
	): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	private async _refreshCache(serviceName: string): Promise<void> {
		if (!(this._healthMonitor.isHealthy || this._healthMonitor.fallbackActive)) {
			logger.warn(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				{ serviceName }
			);
			return;
		}
		try {
			const instances = await this._backend.getInstances(serviceName);
			this._cache.set(serviceName, instances);
		} catch {
			logger.warn("Cache refresh failed, serving stale data", { serviceName });
		}
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
