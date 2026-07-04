import { createTlsBootstrap } from "@trading-model/certificate-client";
import { logger } from "@trading-model/common/config/logger";
import type { TlsBootstrapOptions } from "@trading-model/common/server/bootstrap";
import { createBootstrap } from "@trading-model/common/server/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/common/server/telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { AddressManager } from "../config/address-manager";
import { closeDb, getDb, resetDbState } from "../config/db";
import { env } from "../config/env";
import { dlqRedisQueue } from "../config/redis-queue";
import {
	rebuildQueueFromMongo,
	releaseStaleClaims,
	reloadHttpClientTls,
	shutdownSchedulers,
	startAutoRetry,
	startPeriodicPrune,
} from "../dlq/controller";
import { closeRedisClient } from "../dlq/routes";
import { createServer } from "./server";

async function ensureRedisQueue(): Promise<void> {
	try {
		await dlqRedisQueue.connect();
		await rebuildQueueFromMongo();
		dlqRedisQueue.setOnReconnect(() => {
			void rebuildQueueFromMongo();
		});
	} catch (err) {
		logger.warn(
			"Redis queue unavailable on start — operations continue in DEGRADED mode",
			{
				error: normalizeError(err),
			}
		);
	}
}

function createResilientTlsBootstrap(): TlsBootstrapOptions | null {
	try {
		const tls = createTlsBootstrap(process.env as Record<string, string>);
		if (tls?.setupAutoRenew) {
			const originalSetupAutoRenew = tls.setupAutoRenew.bind(tls);
			tls.setupAutoRenew = (server: import("node:https").Server) => {
				originalSetupAutoRenew(server);
				reloadHttpClientTls().catch((err: unknown) => {
					logger.warn(
						"Failed to reload HTTP client TLS after certificate renewal",
						{
							error: normalizeError(err),
						}
					);
				});
			};
		}
		return tls;
	} catch (err) {
		logger.warn(
			"TLS bootstrap from CA unavailable — falling back to file-based TLS config",
			{
				error: normalizeError(err),
			}
		);
		return null;
	}
}

createBootstrap({
	name: "DLQ Service",
	createServer,
	tlsBootstrap: createResilientTlsBootstrap(),
	onBeforeServer: async () => {
		try {
			await getDb();
			logger.info("DLQ Service database connected", { mongoDb: env.MONGO_DB });
			await releaseStaleClaims();
		} catch (err) {
			logger.error(
				"MongoDB unavailable — service cannot persist messages. Rejecting incoming entries.",
				{
					error: normalizeError(err),
				}
			);
			await resetDbState();
		}
	},
	onStart: () => {
		initializeTelemetry({
			serviceName: "dlq-service",
			serviceVersion: "2.0.0",
			instanceId: process.env.INSTANCE_ID ?? "dlq-1",
			otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
		});
		AddressManager.start();
		void ensureRedisQueue();
		startPeriodicPrune();
		if (env.DLQ_AUTO_RETRY_ENABLED) {
			startAutoRetry();
		}
		logger.info("DLQ Service started", { port: env.PORT });
	},
	onStop: async () => {
		await shutdownTelemetry();
		await shutdownSchedulers();
		await closeRedisClient();
		try {
			await closeDb();
		} catch (err) {
			logger.warn("Error closing database", { error: normalizeError(err) });
		}
	},
});
