import { generateRandomStr } from "@trading-model/crypto/adapters/outbound/node-random";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createRedisClient } from "@trading-model/persistence/redis-connection-manager";
import type Redis from "ioredis";
import { cryptoTokenAdapter } from "../adapters/outbound/crypto-token.adapter";
import { InstanceStore } from "../adapters/outbound/instance-store";
import { RedisInstanceStore } from "../adapters/outbound/redis-instance-store";
import { InstanceTokenManager } from "../domain/instance-token-manager";
import { LeaseManager } from "../domain/lease-manager";
import type { RegistryMetricsPort } from "../domain/ports/discovery-metrics.port";
import type { IInstanceStore } from "../domain/ports/instance-store.interface";
import { ServiceRegistry } from "../domain/service-registry";
import { prometheusDiscoveryMetrics } from "../infrastructure/monitoring/metrics";

export interface ServiceRegistryOptions {
	/** HMAC secret for instance tokens; a random one is generated when absent. */
	signingSecret?: string;
	/** Defaults to the in-memory InstanceStore. */
	instanceStore?: IInstanceStore;
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
			options.signingSecret ?? generateRandomStr()
		),
		metrics: options.metrics ?? prometheusDiscoveryMetrics,
	});
}

export interface DiscoveryAppSettings {
	/** Redis-backed registry when set, in-memory store otherwise. */
	REDIS_URL?: string;
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
	const redisClient = settings.REDIS_URL
		? (createRedisClient(settings.REDIS_URL) as Redis)
		: undefined;
	const instanceStore = _buildInstanceStore(settings, redisClient);
	const registry = createServiceRegistry({
		signingSecret: settings.SIGNING_SECRET,
		instanceStore,
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
	redisClient: Redis | undefined
): IInstanceStore {
	if (!redisClient) {
		logger.info("Redis registry disabled — using in-memory InstanceStore");
		return new InstanceStore();
	}
	logger.info("Redis registry enabled", { url: settings.REDIS_URL });
	return new RedisInstanceStore({
		redis: redisClient,
		keyPrefix: "trading-model:discovery",
		signingSecret: settings.SIGNING_SECRET ?? "",
	});
}
