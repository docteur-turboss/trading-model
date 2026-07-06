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
import { RedisInstanceRepository } from "./redis-instance-repository";
import { RedisKeyBuilder } from "./redis-key-builder";
import { StaleInstanceCleaner } from "./stale-instance-cleaner";
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
	private readonly _keyBuilder: RedisKeyBuilder;
	private readonly _tokenService: TokenService;
	private readonly _cleaner: StaleInstanceCleaner;
	private readonly _instances: RedisInstanceRepository;

	constructor(
		configOrUrl: string | RedisConnectionConfig,
		prefix = "discovery:",
		signingSecret?: string,
		cleanupIntervalMs = 10_000
	) {
		const resolvedPrefix = computePrefix(prefix, configOrUrl);
		this._keyBuilder = new RedisKeyBuilder(resolvedPrefix);
		this._redis = createRedisClient(configOrUrl) as Redis;
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
		this._instances = new RedisInstanceRepository(
			this._redis,
			this._keyBuilder,
			this._tokenService,
		);
		this._cleaner = new StaleInstanceCleaner(
			this._instances,
			cleanupIntervalMs,
		);
	}

	// ─── Registration + Query + Removal (delegated) ────────────────────────────

	async registerInstance(instance: ServiceInstance): Promise<string> {
		return this._instances.registerInstance(instance);
	}

	async updateHeartbeat(id: ServiceIdentity): Promise<number | false> {
		return this._instances.updateHeartbeat(id);
	}

	async getInstances(serviceName: string): Promise<ServiceInstance[]> {
		return this._instances.getInstances(serviceName);
	}

	async getInstance(id: ServiceIdentity): Promise<ServiceInstance | undefined> {
		return this._instances.getInstance(id);
	}

	async removeInstance(id: ServiceIdentity): Promise<boolean> {
		return this._instances.removeInstance(id);
	}

	async listServiceNames(): Promise<string[]> {
		return this._instances.listServiceNames();
	}

	async dump(): Promise<Record<string, ServiceInstance[]>> {
		return this._instances.dump();
	}

	// ─── Token ──────────────────────────────────────────────────────────────────

	async updateToken(instanceId: string): Promise<string> {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		await this._redis.set(
			this._keyBuilder.instanceToken(instanceId),
			newToken
		);
		return newToken;
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
			this._keyBuilder.instanceToken(instanceId)
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

		this._cleaner.start();

		logger.info("RedisRegistryBackend started");
	}

	stop(): void {
		this._cleaner.stop();
		this._redis.disconnect();
		logger.info("RedisRegistryBackend stopped");
	}

	/** Exposed for testing — triggers stale-instance cleanup immediately. */
	async forceCleanup(): Promise<void> {
		await this._cleaner.cleanupNow();
	}
}
