import { createHmac, randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import { CacheManager } from "./cache-manager";
import { PubSubInvalidator } from "./pub-sub-invalidator";

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
	private _redisHealthy = true;
	private _consecutiveFailures = 0;
	private readonly _failureThreshold: number;
	private readonly _healthCheckIntervalMs: number;
	private _healthCheckHandle?: NodeJS.Timeout;
	private _restoreHandle?: NodeJS.Timeout;
	private readonly _redisUrlForPubSub?: string;
	private _healthCheckRunning = false;
	private _fallbackActive = false;
	private _originalBackend?: RegistryBackend;
	private readonly _heartbeatInvalidationThrottleMs = 5000;
	private _lastHeartbeatInvalidation = new Map<string, number>();

	constructor(options: CachedRegistryBackendOptions) {
		this._backend = options.backend;
		this._redisUrlForPubSub = options.redisUrlForPubSub;
		this._failureThreshold = options.redisFailureThreshold ?? 3;
		this._healthCheckIntervalMs = options.redisHealthCheckIntervalMs ?? 15_000;
		this._cache = new CacheManager(options.maxEntries ?? 5000, options.cacheTtlMs);
		this._pubSub = new PubSubInvalidator(options.redisUrlForPubSub);
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this._refreshCache(instance.serviceName);
		await this._pubSub.publish(instance.serviceName);
		return token;
	}

	async updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false> {
		const result = await this._backend.updateHeartbeat(serviceName, instanceId);
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

		if (this._fallbackActive) {
			return this._backend.getInstances(serviceName);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached;
		}

		if (!this._redisHealthy) {
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
		serviceName: string,
		instanceId: string
	): Promise<ServiceInstance | undefined> {
		if (this._fallbackActive) {
			return await this._backend.getInstance(serviceName, instanceId);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached.find(
				(inst: ServiceInstance) => inst.instanceId === instanceId
			);
		}
		if (!this._redisHealthy) {
			const stale = this._cache.getStale(serviceName);
			if (stale) {
				return stale.find(
					(inst: ServiceInstance) => inst.instanceId === instanceId
				);
			}
		}
		return await this._backend.getInstance(serviceName, instanceId);
	}

	async removeInstance(
		serviceName: string,
		instanceId: string
	): Promise<boolean> {
		const result = await this._backend.removeInstance(serviceName, instanceId);
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
		if (!(this._redisHealthy || this._fallbackActive)) {
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

		this._clearTimers();

		await this._pubSub.start(this._cache);

		this._startHealthCheck();
		this._startRestoreLoop();
	}

	private _isRedisBackend(): boolean {
		return typeof (this._backend as { ping?: unknown }).ping === "function";
	}

	private _startHealthCheck(): void {
		if (!(this._redisUrlForPubSub || this._isRedisBackend())) {
			return;
		}
		this._healthCheckHandle = setInterval(
			() => this._performHealthCheck(),
			this._healthCheckIntervalMs
		);
	}

	private async _performHealthCheck(): Promise<void> {
		if (this._healthCheckRunning) {
			return;
		}
		this._healthCheckRunning = true;
		try {
			const healthy = await this.ping();
			if (healthy) {
				if (!this._redisHealthy) {
					this._redisHealthy = true;
					logger.info(
						"Redis backend is healthy again — resumed normal operation"
					);
				}
				this._consecutiveFailures = 0;
			} else {
				this._consecutiveFailures++;
				if (this._consecutiveFailures >= this._failureThreshold) {
					this._redisHealthy = false;
					logger.error("Redis backend unhealthy — serving stale cache", {
						consecutiveFailures: this._consecutiveFailures,
					});
				}
			}
		} catch {
			this._consecutiveFailures++;
			if (this._consecutiveFailures >= this._failureThreshold) {
				this._redisHealthy = false;
				logger.error("Redis backend unhealthy — serving stale cache", {
					consecutiveFailures: this._consecutiveFailures,
				});
			}
		} finally {
			this._healthCheckRunning = false;
		}
	}

	private _startRestoreLoop(): void {
		if (!(this._redisUrlForPubSub || this._isRedisBackend())) {
			return;
		}
		this._restoreHandle = setInterval(
			() => this._performRestoreCheck(),
			this._healthCheckIntervalMs * 6
		);
	}

	private async _performRestoreCheck(): Promise<void> {
		if (this._redisHealthy) {
			return;
		}
		try {
			const healthy = await this.ping();
			if (healthy) {
				if (this._fallbackActive && this._originalBackend) {
					this._backend = this._originalBackend;
					this._originalBackend = undefined;
					this._fallbackActive = false;
					logger.info("Restored original Redis backend");
				}
				this._redisHealthy = true;
				this._consecutiveFailures = 0;
				this._cache.clear();
				logger.info(
					"Redis backend is healthy again — resumed normal operation"
				);
			}
		} catch {
			logger.warn("Redis restore attempt failed — staying on stale cache");
		}
	}

	async ping(): Promise<boolean> {
		if (this._fallbackActive) {
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
		this._redisHealthy = false;
		this._consecutiveFailures = this._failureThreshold;
	}

	setFallbackBackend(fallback: RegistryBackend): void {
		logger.warn(
			"CachedRegistryBackend.setFallbackBackend — swapping to fallback backend"
		);
		if (!this._fallbackActive) {
			this._originalBackend = this._backend;
		}
		this._fallbackActive = true;
		this._backend = fallback;
		this._cache.clear();
	}

	private _clearTimers(): void {
		if (this._healthCheckHandle) {
			clearInterval(this._healthCheckHandle);
			this._healthCheckHandle = undefined;
		}
		if (this._restoreHandle) {
			clearInterval(this._restoreHandle);
			this._restoreHandle = undefined;
		}
	}

	stop(): void {
		this._clearTimers();
		this._cache.clear();
		this._pubSub.stop();
		this._stopBackend();
	}

	private _stopBackend(): void {
		if (this._originalBackend) {
			try {
				this._originalBackend.stop();
			} catch {
				/* ignore */
			}
			this._originalBackend = undefined;
		}
		this._backend.stop();
	}
}
