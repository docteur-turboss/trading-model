import { generateRandomStr } from "@trading-model/crypto/adapters/outbound/node-random";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { RedisConnectionMode } from "@trading-model/persistence/redis-config";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import {
	type RedisEnv,
	redisConnectionFromEnv,
} from "@trading-model/persistence/redis-env";
import type Redis from "ioredis";
import { cryptoTokenAdapter } from "../adapters/outbound/crypto-token.adapter";
import { InMemoryTokenStore } from "../adapters/outbound/in-memory-token-store";
import { InstanceStore } from "../adapters/outbound/instance-store";
import { RedisInstanceStore } from "../adapters/outbound/redis-instance-store";
import { RedisTokenStore } from "../adapters/outbound/redis-token-store";
import { InstanceTokenManager } from "../domain/instance-token-manager";
import { LeaseManager } from "../domain/lease-manager";
import type { RegistryMetricsPort } from "../domain/ports/discovery-metrics.port";
import type { InstanceStorePort } from "../domain/ports/instance-store.port";
import type { InstanceTokenStorePort } from "../domain/ports/instance-token-store.port";
import { ServiceRegistry } from "../domain/service-registry";
import { prometheusDiscoveryMetrics } from "../infrastructure/monitoring/metrics";

// Trailing colon: buildRedisKey appends segments as is, and the ACL (ADR-0047) matches `trading-model:discovery:*`.
const DISCOVERY_KEY_PREFIX = "trading-model:discovery:";

export interface ServiceRegistryOptions {
	/** HMAC secret for instance tokens; a random one is generated when absent. */
	signingSecret?: string;
	/** Defaults to the in-memory InstanceStore. */
	instanceStore?: InstanceStorePort;
	/** Defaults to an in-memory store: single replica only. */
	tokenStore?: InstanceTokenStorePort;
	/** Defaults to the Prometheus collectors. */
	metrics?: RegistryMetricsPort;
}

/** Wires the domain ServiceRegistry with its concrete adapters. */
export function createServiceRegistry(
	options: ServiceRegistryOptions = {}
): ServiceRegistry {
	return new ServiceRegistry({
		instanceStore: options.instanceStore ?? new InstanceStore(),
		tokenManager: new InstanceTokenManager(
			cryptoTokenAdapter,
			options.signingSecret ?? generateRandomStr(),
			options.tokenStore ?? new InMemoryTokenStore()
		),
		metrics: options.metrics ?? prometheusDiscoveryMetrics,
	});
}

/** Redis-backed registry when Redis is configured, in-memory store otherwise. */
export interface DiscoveryAppSettings extends RedisEnv {
	SIGNING_SECRET?: string;
	CLEANUP_SERVICE_INTERVAL_MS: number;
}

export interface DiscoveryApp {
	registry: ServiceRegistry;
	leaseManager: LeaseManager;
	/** Present only in Redis mode; connected and closed by the entry point. */
	redisClient?: Redis;
}

/** Wires the whole discovery service: instance store, registry and lease manager. */
export function createDiscoveryApp(
	settings: DiscoveryAppSettings
): DiscoveryApp {
	const redisConnection = redisConnectionFromEnv(settings);
	const redisClient = redisConnection
		? createRedisClient(redisConnection)
		: undefined;
	const instanceStore = _buildInstanceStore(
		settings,
		redisClient,
		redisConnection?.mode
	);
	// Replicas share the instance tokens through Redis: a heartbeat may reach
	// any of them.
	const registry = createServiceRegistry({
		signingSecret: settings.SIGNING_SECRET,
		instanceStore,
		tokenStore: redisClient
			? new RedisTokenStore({
					redis: redisClient,
					keyPrefix: DISCOVERY_KEY_PREFIX,
				})
			: undefined,
	});
	const leaseManager = new LeaseManager(registry, {
		cleanupIntervalMs: settings.CLEANUP_SERVICE_INTERVAL_MS,
		logger,
		metrics: prometheusDiscoveryMetrics,
	});
	return { registry, leaseManager, redisClient };
}

function _buildInstanceStore(
	settings: DiscoveryAppSettings,
	redisClient: Redis | undefined,
	redisMode: RedisConnectionMode | undefined
): InstanceStorePort {
	if (!redisClient) {
		logger.info("Redis registry disabled — using in-memory InstanceStore");
		return new InstanceStore();
	}
	logger.info("Redis registry enabled", { mode: redisMode });
	return new RedisInstanceStore({
		redis: redisClient,
		keyPrefix: DISCOVERY_KEY_PREFIX,
		signingSecret: settings.SIGNING_SECRET ?? "",
	});
}
