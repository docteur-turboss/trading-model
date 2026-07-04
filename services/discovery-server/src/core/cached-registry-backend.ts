import { createHmac, randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { LruCache } from "@trading-model/common/utils/lru-cache";
import Redis from "ioredis";

interface CacheEntry {
	data: ServiceInstance[];
}

export class CachedRegistryBackend implements RegistryBackend {
	private readonly _cache: LruCache<CacheEntry>;
	private _pubSub?: Redis;
	private readonly _redisUrlForPubSub?: string;
	private _redisHealthy = true;
	private _consecutiveFailures = 0;
	private readonly _redisFailureThreshold: number;
	private readonly _redisHealthCheckIntervalMs: number;
	private _healthCheckHandle?: NodeJS.Timeout;
	private _restoreHandle?: NodeJS.Timeout;
	private readonly _staleData: LruCache<ServiceInstance[]>;
	private _healthCheckRunning = false;
	private _fallbackActive = false;
	private _originalBackend?: RegistryBackend;
	constructor(
		private _backend: RegistryBackend,
		cacheTtlMs: number,
		redisUrlForPubSub?: string,
		maxEntries = 5000,
		redisFailureThreshold = 3,
		redisHealthCheckIntervalMs = 15_000
	) {
		this.cacheTtlMs = cacheTtlMs;
		this._redisUrlForPubSub = redisUrlForPubSub;
		this._redisFailureThreshold = redisFailureThreshold;
		this._redisHealthCheckIntervalMs = redisHealthCheckIntervalMs;
		this._cache = new LruCache<CacheEntry>(maxEntries, cacheTtlMs);
		this._staleData = new LruCache<ServiceInstance[]>(maxEntries);
	}

	private async _publishInvalidation(serviceName: string): Promise<void> {
		if (this._pubSub?.status !== "ready") {
			return;
		}
		try {
			await this._pubSub.publish("cache:invalidate", serviceName);
		} catch (err) {
			logger.warn("Failed to publish cache invalidation", {
				serviceName,
				error: normalizeError(err),
			});
		}
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const token = await this._backend.registerInstance(instance);
		await this._refreshCache(instance.serviceName);
		await this._publishInvalidation(instance.serviceName);
		return token;
	}

	private readonly _heartbeatInvalidationThrottleMs = 5000;
	private _lastHeartbeatInvalidation = new Map<string, number>();

	async updateHeartbeat(
		serviceName: string,
		instanceId: string
	): Promise<number | false> {
		const result = await this._backend.updateHeartbeat(serviceName, instanceId);
		if (result !== false) {
			await this._refreshCache(serviceName);
			// Throttled cross-node cache invalidation for heartbeats
			const now = Date.now();
			const last = this._lastHeartbeatInvalidation.get(serviceName) ?? 0;
			if (now - last >= this._heartbeatInvalidationThrottleMs) {
				this._lastHeartbeatInvalidation.set(serviceName, now);
				await this._publishInvalidation(serviceName);
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
		// When pagination is requested, bypass cache to get exact slice
		if (offset !== undefined || limit !== undefined) {
			const all = await this._backend.getInstances(serviceName);
			const start = offset ?? 0;
			return all.slice(start, limit === undefined ? undefined : start + limit);
		}

		// Fallback active → backend is InMemory, healthy, and authoritative
		if (this._fallbackActive) {
			return this._backend.getInstances(serviceName);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached.data;
		}

		// When the backend is unhealthy, serve stale data if available
		if (!this._redisHealthy) {
			const stale = this._staleData.get(serviceName);
			if (stale) {
				logger.warn(
					"Backend unhealthy — serving stale cached instance list for",
					{ serviceName }
				);
				return stale;
			}
			logger.warn(
				"Backend unhealthy — no stale data available, returning empty list for",
				{
					serviceName,
				}
			);
			return [];
		}

		const instances = await this._backend.getInstances(serviceName);
		this._cache.set(serviceName, { data: instances });
		this._staleData.set(serviceName, instances);
		return instances;
	}

	async getInstance(
		serviceName: string,
		instanceId: string
	): Promise<ServiceInstance | undefined> {
		// Fallback active → backend is authoritative
		if (this._fallbackActive) {
			return await this._backend.getInstance(serviceName, instanceId);
		}

		const cached = this._cache.get(serviceName);
		if (cached) {
			return cached.data.find(
				(inst: ServiceInstance) => inst.instanceId === instanceId
			);
		}
		if (!this._redisHealthy) {
			const stale = this._staleData.get(serviceName);
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
		await this._publishInvalidation(serviceName);
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

	/** Stale-while-revalidate: keep serving stale data while refreshing in background.
	 *  Never delete before refresh to avoid a window where getInstances() bypasses cache.
	 *  When Redis is unhealthy, skip backend call entirely — stale data is better than failure. */
	private async _refreshCache(serviceName: string): Promise<void> {
		if (!(this._redisHealthy || this._fallbackActive)) {
			logger.warn(
				"Backend unhealthy — skipping cache refresh, serving stale data",
				{
					serviceName,
				}
			);
			return;
		}
		try {
			const instances = await this._backend.getInstances(serviceName);
			this._cache.set(serviceName, { data: instances });
			this._staleData.set(serviceName, instances);
		} catch {
			logger.warn("Cache refresh failed, serving stale data", { serviceName });
		}
	}

	async start(): Promise<void> {
		this._backend.start();

		// Clear existing handles before creating new ones
		if (this._healthCheckHandle) {
			clearInterval(this._healthCheckHandle);
			this._healthCheckHandle = undefined;
		}
		if (this._restoreHandle) {
			clearInterval(this._restoreHandle);
			this._restoreHandle = undefined;
		}

		// Create PubSub connection AFTER backend start to avoid
		// missing invalidation messages between construction and start.
		if (this._redisUrlForPubSub && !this._pubSub) {
			try {
				this._pubSub = new Redis(this._redisUrlForPubSub, {
					lazyConnect: true,
					maxRetriesPerRequest: 3,
				});
				await this._pubSub.connect();

				this._pubSub.on("message", (channel: string, message: string) => {
					if (channel === "cache:invalidate") {
						this._cache.delete(message);
						this._staleData.delete(message);
						logger.debug("Cache invalidated via Pub/Sub", {
							serviceName: message,
						});
					}
				});

				await this._pubSub.subscribe("cache:invalidate");
				logger.info("Redis Pub/Sub connected for cache invalidation");
			} catch (err) {
				logger.error("Failed to connect Redis Pub/Sub for cache invalidation", {
					error: normalizeError(err),
				});
			}
		}

		// Redis health check loop for runtime circuit breaker
		this._healthCheckHandle = setInterval(async () => {
			if (this._healthCheckRunning) {
				return;
			}
			this._healthCheckRunning = true;
			try {
				if (this._redisUrlForPubSub || this._isRedisBackend()) {
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
						if (this._consecutiveFailures >= this._redisFailureThreshold) {
							this._redisHealthy = false;
							logger.error("Redis backend unhealthy — serving stale cache", {
								consecutiveFailures: this._consecutiveFailures,
							});
						}
					}
				}
			} catch {
				this._consecutiveFailures++;
				if (this._consecutiveFailures >= this._redisFailureThreshold) {
					this._redisHealthy = false;
					logger.error("Redis backend unhealthy — serving stale cache", {
						consecutiveFailures: this._consecutiveFailures,
					});
				}
			} finally {
				this._healthCheckRunning = false;
			}
		}, this._redisHealthCheckIntervalMs);

		// Periodic restore attempt when Redis is degraded
		if (this._redisUrlForPubSub || this._isRedisBackend()) {
			this._restoreHandle = setInterval(async () => {
				if (this._redisHealthy) {
					return;
				}
				try {
					const healthy = await this.ping();
					if (healthy) {
						// If we were in fallback mode with a saved original backend, restore it
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
			}, this._redisHealthCheckIntervalMs * 6);
		}
	}

	private _isRedisBackend(): boolean {
		return typeof (this._backend as { ping?: unknown }).ping === "function";
	}

	async ping(): Promise<boolean> {
		// When in fallback mode (Redis was replaced by InMemory), report degraded
		if (this._fallbackActive) {
			return false;
		}

		// PubSub health is independent of backend health.
		// A PubSub failure only degrades cross-node cache invalidation;
		// the backend may still serve fresh data.
		if (this._pubSub?.status === "ready") {
			try {
				await this._pubSub.ping();
			} catch {
				logger.warn("PubSub ping failed — cache invalidation degraded");
			}
		}
		// Duck-typing: if the backend exposes a lightweight ping() (e.g. Redis PING), prefer it
		const backendWithPing = this._backend as { ping?: () => Promise<boolean> };
		if (typeof backendWithPing.ping === "function") {
			try {
				return await backendWithPing.ping();
			} catch {
				return false;
			}
		}
		// No ping method: if Redis was configured but is gone, report degraded
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
		this._consecutiveFailures = this._redisFailureThreshold;
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
		this._staleData.clear();
	}

	stop(): void {
		if (this._healthCheckHandle) {
			clearInterval(this._healthCheckHandle);
			this._healthCheckHandle = undefined;
		}
		if (this._restoreHandle) {
			clearInterval(this._restoreHandle);
			this._restoreHandle = undefined;
		}
		this._cache.clear();
		this._staleData.clear();
		if (this._pubSub) {
			try {
				this._pubSub.unsubscribe("cache:invalidate");
			} catch {
				/* ignore */
			}
			try {
				this._pubSub.disconnect();
			} catch {
				/* ignore */
			}
			this._pubSub = undefined;
		}
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
