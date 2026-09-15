import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { createRedisClient } from "@trading-model/common/persistence/redis-connection-manager";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import type Redis from "ioredis";
import { InstanceStore } from "../adapters/outbound/instance-store";
import { RedisInstanceStore } from "../adapters/outbound/redis-instance-store";
import { LeaseManager } from "../domain/lease-manager";
import type { IInstanceStore } from "../domain/ports/instance-store.interface";
import { ServiceRegistry } from "../domain/service-registry";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

let redisClient: Redis | undefined;

function buildInstanceStore(): IInstanceStore {
	if (!ENV.REDIS_URL) {
		logger.info("Redis registry disabled — using in-memory InstanceStore");
		return new InstanceStore();
	}
	redisClient = createRedisClient(ENV.REDIS_URL) as Redis;
	logger.info("Redis registry enabled", { url: ENV.REDIS_URL });
	return new RedisInstanceStore({
		redis: redisClient,
		keyPrefix: "trading-model:discovery",
		signingSecret: ENV.SIGNING_SECRET ?? "",
	});
}

const REGISTRY = new ServiceRegistry(ENV.SIGNING_SECRET, buildInstanceStore());
const LEASE_MANAGER = new LeaseManager(REGISTRY, {
	cleanupIntervalMs: ENV.CLEANUP_SERVICE_INTERVAL_MS,
	logger,
});

createBootstrap({
	name: "Discovery",
	createServer: () =>
		createServer(REGISTRY, {
			readiness: [
				{
					name: "redis",
					check: async () => {
						if (!redisClient) {
							return true;
						}
						try {
							return (await redisClient.ping()) === "PONG";
						} catch {
							return false;
						}
					},
				},
			],
		}),
	onStart: async () => {
		initializeTelemetry({
			serviceName: ServiceInstanceName.DiscoveryService,
			serviceVersion: process.env.APP_VERSION ?? "1.0.0",
			instanceId: toInstanceId(process.env.INSTANCE_ID ?? "discovery-1"),
			otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
		if (redisClient) {
			try {
				await redisClient.connect();
			} catch (err) {
				logger.error("Redis registry connect failed", {
					error: normalizeError(err),
				});
			}
		}
		LEASE_MANAGER.start();
	},
	onStop: async () => {
		LEASE_MANAGER.stop();
		if (redisClient) {
			redisClient.disconnect();
		}
		await shutdownTelemetry();
	},
});
