import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { createDiscoveryApp } from "../config/container";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const {
	registry: REGISTRY,
	leaseManager: LEASE_MANAGER,
	redisClient,
} = createDiscoveryApp(ENV);

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
