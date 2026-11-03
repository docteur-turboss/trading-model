import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { toInstanceId } from "@trading-model/primitives/primitives";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/infrastructure/telemetry";
import { closeRedisClient } from "../adapters/inbound/routes";
import { AddressManager } from "../config/address-manager";
import { closeDb, getDb, resetDbState } from "../config/db";
import { ENV } from "../infrastructure/config/env";
import { ensureRedisQueue } from "../infrastructure/redis-init";
import {
	releaseStaleClaims,
	shutdownSchedulers,
	startAutoRetry,
	startPeriodicPrune,
} from "../shared/controller-reexports";
import { createServer } from "./server";

createBootstrap({
	name: "DLQ Service",
	createServer,
	onBeforeServer: () => _onBeforeServer(),
	onStart: () => _onStart(),
	onStop: () => _onStop(),
});

async function _onBeforeServer(): Promise<void> {
	try {
		await getDb();
		logger.info("DLQ Service database connected", { mongoDb: ENV.MONGO_DB });
		await releaseStaleClaims();
	} catch (err) {
		logger.error(
			"MongoDB unavailable — service cannot persist messages. Rejecting incoming entries.",
			{ error: normalizeError(err) }
		);
		await resetDbState();
	}
}

function _onStart(): void {
	initializeTelemetry({
		serviceName: ServiceInstanceName.DlqService,
		serviceVersion: "2.0.0",
		instanceId: toInstanceId(process.env.INSTANCE_ID ?? "dlq-1"),
		otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
	});
	AddressManager.lifecycleManager.start();
	void ensureRedisQueue();
	startPeriodicPrune();
	if (ENV.DLQ_AUTO_RETRY_ENABLED) {
		startAutoRetry();
	}
	logger.info("DLQ Service started", { port: ENV.PORT });
}

async function _onStop(): Promise<void> {
	await shutdownTelemetry();
	await shutdownSchedulers();
	await closeRedisClient();
	try {
		await closeDb();
	} catch (err) {
		logger.warn("Error closing database", { error: normalizeError(err) });
	}
}
