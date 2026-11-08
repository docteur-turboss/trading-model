import "./telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
import { AddressManager } from "../config/address-manager";
import { closeDb, getDb, resetDbState } from "../config/db";
import {
	releaseStaleClaims,
	shutdownSchedulers,
	startPeriodicPrune,
} from "../config/shutdown-manager";
import { startAutoRetry } from "../infrastructure/auto-retry-scheduler";
import { ENV } from "../infrastructure/config/env";
import { ensureRedisQueue } from "../infrastructure/redis-init";
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
	try {
		await closeDb();
	} catch (err) {
		logger.warn("Error closing database", { error: normalizeError(err) });
	}
}
