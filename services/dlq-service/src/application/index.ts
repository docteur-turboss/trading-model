import "./telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { createBootstrap } from "@trading-model/server-utils/application/services/bootstrap";
import { shutdownTelemetry } from "@trading-model/server-utils/infrastructure/telemetry";
import { AddressManager } from "../config/address-manager";
import { createDlqApp } from "../config/container";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const app = createDlqApp(ENV);

createBootstrap({
	name: "DLQ Service",
	createServer: () => createServer(app.handlers),
	onBeforeServer: () => _onBeforeServer(),
	onStart: () => _onStart(),
	onStop: () => _onStop(),
});

async function _onBeforeServer(): Promise<void> {
	try {
		await app.connectDb();
		logger.info("DLQ Service database connected", { mongoDb: ENV.MONGO_DB });
		await app.releaseStaleClaims();
	} catch (err) {
		logger.error(
			"MongoDB unavailable — service cannot persist messages. Rejecting incoming entries.",
			{ error: normalizeError(err) }
		);
		await app.resetDb();
	}
}

function _onStart(): void {
	AddressManager.lifecycleManager.start();
	app.start();
	logger.info("DLQ Service started", { port: ENV.PORT });
}

async function _onStop(): Promise<void> {
	await shutdownTelemetry();
	await app.shutdownSchedulers();
	try {
		await app.closeDb();
	} catch (err) {
		logger.warn("Error closing database", { error: normalizeError(err) });
	}
}
