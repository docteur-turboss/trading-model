import "./telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
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
						return (await redisClient.ping()) === "PONG";
					},
				},
			],
		}),
	onStart: async () => {
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
