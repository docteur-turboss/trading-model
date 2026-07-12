import { logger } from "@trading-model/common/config/logger";
import { toInstanceId } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { createBootstrap } from "@trading-model/server-utils/server/bootstrap";
import {
	initializeTelemetry,
	shutdownTelemetry,
} from "@trading-model/server-utils/server/telemetry";
import { AddressManager } from "../config/address-manager";
import { closeDb, getDb, resetDbState } from "../config/db";
import { ENV } from "../config/env";
import {
	releaseStaleClaims,
	shutdownSchedulers,
	startAutoRetry,
	startPeriodicPrune,
} from "../dlq/controller-reexports";
import { closeRedisClient } from "../dlq/routes";
import { ensureRedisQueue } from "./redis-init";
import { createServer } from "./server";
import { createResilientTlsBootstrap } from "./tls-bootstrap";

createBootstrap({
	name: "DLQ Service",
	createServer,
	tlsBootstrap: createResilientTlsBootstrap(),
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
		serviceName: "dlq-service",
		serviceVersion: "2.0.0",
		instanceId: toInstanceId(process.env.INSTANCE_ID ?? "dlq-1"),
		otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
	});
	AddressManager.start();
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
