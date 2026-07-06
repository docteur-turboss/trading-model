import { createHmac, randomBytes } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import type {
	RegistryBackend,
	ServiceInstance,
} from "@trading-model/common/contracts/service-registry.types";
import type { ServiceEndpoint, ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import Redis from "ioredis";
import {
	computePrefix,
	createRedisClient,
	type RedisConnectionConfig,
} from "./redis-client-factory";
import { TokenService } from "./token-service";

export type { RedisSentinelConfig, RedisClusterNodesConfig, RedisConnectionConfig } from "./redis-client-factory";

// ─── Backend ────────────────────────────────────────────────────────────────

/**
 * RedisRegistryBackend
 *
 * Distributed, persistent backend for service instance storage.
 *
 * Designed for multi-node / multi-region deployments where
 * multiple discovery-server instances must share the same
 * registry state.
 *
 * ## High-Availability modes
 *
 * | Mode       | Env vars                              | Behaviour                |
 * |------------|---------------------------------------|--------------------------|
 * | Single     | `REDIS_URL`                           | Legacy, single node      |
 * | Sentinel   | `REDIS_SENTINELS` + `REDIS_SENTINEL_MASTER_NAME` | Auto-failover |
 * | Cluster    | `REDIS_CLUSTER_NODES`                 | Sharding + replication   |
 *
 * Storage layout in Redis:
 *   {prefix}service:{serviceName}:instances  →  Set of instanceIds
 *   {prefix}instance:{instanceId}:metadata   →  JSON-serialised ServiceInstance
 *   {prefix}instance:{instanceId}:token      →  String (HMAC token)
 *
 * Token generation, validation, and instance name verification
 * are handled locally (same logic as InMemoryRegistryBackend) —
 * only storage is distributed.
 */
export class RedisRegistryBackend implements RegistryBackend {
	private readonly _redis: Redis;
	private readonly _prefix: string;
	private readonly _tokenService: TokenService;
	private readonly _cleanupIntervalMs: number;
	private _cleanupHandle?: NodeJS.Timeout;

	constructor(
		configOrUrl: string | RedisConnectionConfig,
		prefix = "discovery:",
		signingSecret?: string,
		cleanupIntervalMs = 10_000
	) {
		this._prefix = computePrefix(prefix, configOrUrl);
		this._redis = createRedisClient(configOrUrl) as Redis;
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
		this._cleanupIntervalMs = cleanupIntervalMs;
	}

	// ─── Registration ──────────────────────────────────────────────────────────

	private async _resolveToken(instanceId: string): Promise<string> {
		const tokenKey = `${this._prefix}instance:${instanceId}:token`;
		const token = this._tokenService.generateInstanceToken(instanceId);
		const tokenSet = await this._redis.set(tokenKey, token, "NX");
		return tokenSet === "OK"
			? token
			: ((await this._redis.get(tokenKey)) ?? token);
	}

	private async _buildStoredInstance(
		instance: ServiceInstance,
		now: number
	): Promise<ServiceInstance> {
		const storedInstance: ServiceInstance = {
			...instance,
			registeredAt: instance.registeredAt ?? now,
			lastHeartbeat: now,
		};
		const existingJson = await this._redis.get(
			`${this._prefix}instance:${instance.instanceId}:metadata`
		);
		if (existingJson) {
			try {
				const existing: ServiceInstance = JSON.parse(existingJson);
				storedInstance.registeredAt = existing.registeredAt;
				storedInstance.lastHeartbeat = Math.max(
					storedInstance.lastHeartbeat,
					existing.lastHeartbeat
				);
			} catch (err) {
				logger.warn("Failed to parse existing instance metadata", {
					instanceId: instance.instanceId,
					err: normalizeError(err),
				});
			}
		}
		return storedInstance;
	}

	async registerInstance(instance: ServiceInstance): Promise<string> {
		const { serviceName, instanceId } = instance;
		const now = Date.now();
		const finalToken = await this._resolveToken(instanceId);

		const multi = this._redis.multi();
		multi.sadd(`${this._prefix}service:${serviceName}:instances`, instanceId);
		const storedInstance = await this._buildStoredInstance(instance, now);
		multi.set(
			`${this._prefix}instance:${instanceId}:metadata`,
			JSON.stringify(storedInstance)
		);
		await multi.exec();

		return finalToken;
	}

	// ─── Heartbeat ──────────────────────────────────────────────────────────────

	async updateHeartbeat({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<number | false> {
		const exists = await this._redis.sismember(
			`${this._prefix}service:${serviceName}:instances`,
			instanceId
		);

		if (!exists) {
			return false;
		}

		const json = await this._redis.get(
			`${this._prefix}instance:${instanceId}:metadata`
		);
		if (!json) {
			return false;
		}

		try {
			const instance: ServiceInstance = JSON.parse(json);
			// F30-32: Ensure monotonic heartbeat — clock skew must never
			// push lastHeartbeat backwards or expire healthy instances.
			instance.lastHeartbeat = Math.max(instance.lastHeartbeat, Date.now());

			const multi = this._redis.multi();
			multi.set(
				`${this._prefix}instance:${instanceId}:metadata`,
				JSON.stringify(instance)
			);
			// Tag which server last updated this instance for skew attribution
			multi.set(
				`${this._prefix}instance:${instanceId}:updatedBy`,
				`${serviceName}:${instanceId}`
			);
			await multi.exec();

			return instance.ttl;
		} catch (err) {
			logger.warn("Failed to update heartbeat in Redis", {
				serviceName,
				instanceId,
				err: normalizeError(err),
			});
			return false;
		}
	}

	// ─── Token ──────────────────────────────────────────────────────────────────

	async updateToken(instanceId: string): Promise<string> {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		await this._redis.set(
			`${this._prefix}instance:${instanceId}:token`,
			newToken
		);
		return newToken;
	}

	// ─── Query ──────────────────────────────────────────────────────────────────

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		const instanceIds = await this._redis.smembers(
			`${this._prefix}service:${serviceName}:instances`
		);

		if (instanceIds.length === 0) {
			return [];
		}

		const keys = instanceIds.map(
			(id) => `${this._prefix}instance:${id}:metadata`
		);
		const results = await this._redis.mget(keys);

		const instances: ServiceInstance[] = [];
		for (const json of results) {
			if (json) {
				try {
					instances.push(JSON.parse(json));
				} catch (err) {
					logger.warn("Skipping corrupt instance entry in Redis", {
						err: normalizeError(err),
					});
				}
			}
		}

		return instances;
	}

	async getInstance({
		instanceId,
	}: ServiceIdentity): Promise<ServiceInstance | undefined> {
		const json = await this._redis.get(
			`${this._prefix}instance:${instanceId}:metadata`
		);
		if (!json) {
			return;
		}

		try {
			return JSON.parse(json);
		} catch (err) {
			logger.warn("Failed to parse instance metadata from Redis", {
				instanceId,
				err: normalizeError(err),
			});
		}
	}

	// ─── Removal ────────────────────────────────────────────────────────────────

	async removeInstance({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<boolean> {
		const multi = this._redis.multi();
		multi.srem(`${this._prefix}service:${serviceName}:instances`, instanceId);
		multi.del(`${this._prefix}instance:${instanceId}:metadata`);
		multi.del(`${this._prefix}instance:${instanceId}:token`);
		multi.del(`${this._prefix}instance:${instanceId}:updatedBy`);

		const results = await multi.exec();
		if (!results) {
			return false;
		}

		// results[0] is the srem result — [error, count]
		const sremResult = results[0];
		return sremResult?.[1] === 1;
	}

	// ─── Introspection ──────────────────────────────────────────────────────────

	async listServiceNames(): Promise<string[]> {
		const keys = await this._redis.keys(`${this._prefix}service:*:instances`);
		return keys
			.map((key) => {
				const match = key.match(
					new RegExp(`^${this._prefix}service:(.+):instances$`)
				);
				return match ? match[1] : null;
			})
			.filter((name): name is string => name !== null);
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		const serviceNames = await this.listServiceNames();
		const snapshot: Record<string, ServiceInstance[]> = {};

		for (const name of serviceNames) {
			snapshot[name] = await this.getInstances(name);
		}

		return snapshot;
	}

	// ─── Token / ID validation ─────────────────────────────────────────────────

	generateInstanceToken(instanceId: string): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	async validInstanceToken(
		token: string,
		instanceId: string
	): Promise<boolean> {
		const storedToken = await this._redis.get(
			`${this._prefix}instance:${instanceId}:token`
		);
		return this._tokenService.validInstanceToken(token, instanceId, storedToken ?? undefined);
	}

	generateInstanceId({
		serviceName,
		address,
		port,
	}: ServiceEndpoint): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}

	// ─── Lifecycle ─────────────────────────────────────────────────────────────

	start(): void {
		this._redis.connect().catch((err) => {
			logger.error("Failed to connect to Redis", {
				error: normalizeError(err),
			});
		});

		// F38: Add a random initial delay (0 … cleanupIntervalMs) so that
		// multiple discovery-server instances don't run cleanup simultaneously.
		// Clock skew is already handled by a 2000ms tolerance in
		// cleanupExpiredInstances().
		const initialDelay = Math.floor(Math.random() * this._cleanupIntervalMs);
		setTimeout(() => {
			this._cleanupHandle = setInterval(() => {
				this._cleanupExpiredInstances().catch((err) => {
					logger.error("Redis cleanup error", { error: normalizeError(err) });
				});
			}, this._cleanupIntervalMs);
		}, initialDelay);

		logger.info("RedisRegistryBackend started", {
			cleanupIntervalMs: this._cleanupIntervalMs,
			initialDelay,
		});
	}

	stop(): void {
		if (this._cleanupHandle) {
			clearInterval(this._cleanupHandle);
			this._cleanupHandle = undefined;
		}
		this._redis.disconnect();
		logger.info("RedisRegistryBackend stopped");
	}

	private async _cleanupExpiredInstances(): Promise<void> {
		const ClockSkewToleranceMs = 2000;
		const now = Date.now();
		const serviceNames = await this.listServiceNames();

		for (const serviceName of serviceNames) {
			const instances = await this.getInstances(serviceName);

			for (const instance of instances) {
				if (
					now - instance.lastHeartbeat >
					instance.ttl + ClockSkewToleranceMs
				) {
					logger.warn("Expired instance removed", {
						serviceName,
						instanceId: instance.instanceId,
						heartbeatAge: now - instance.lastHeartbeat,
						ttl: instance.ttl,
					});
					await this.removeInstance({
						serviceName,
						instanceId: instance.instanceId,
					});
				}
			}
		}
	}
}
