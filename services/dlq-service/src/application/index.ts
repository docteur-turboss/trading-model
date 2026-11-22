import "./telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { logger } from "@trading-model/http/logger";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { AddressManager } from "../config/address-manager";
import { createDlqApp } from "../config/container";
import { ENV } from "../infrastructure/config/env";
import { createServer } from "./server";

const app = createDlqApp(ENV);

createBootstrap({
	name: "DLQ Service",
	createServer: () => createServer(app.handlers, app.mongoReadiness),
	onBeforeServer: () => _onBeforeServer(),
	onStart: () => _onStart(),
	onStop: () => _onStop(),
});

/** Listens first: MongoDB connects in the background, requests get 503 until it is up. */
function _onBeforeServer(): void {
	app
		.connectDb()
		.then(() => {
			logger.info("DLQ Service database connected", { mongoDb: ENV.MONGO_DB });
			return app.releaseStaleClaims();
		})
		.catch((err: unknown) => {
			logger.error("DLQ Service database start-up failed", {
				error: normalizeError(err),
			});
		});
}

let _discovery: ReturnType<
	typeof AddressManager.lifecycleManager.start
> | null = null;

function _onStart(): void {
	_discovery = AddressManager.lifecycleManager.start();
	app.start();
	logger.info("DLQ Service started", { port: ENV.PORT });
}

async function _onStop(): Promise<void> {
	await shutdownTelemetry();
	try {
		await _discovery?.stop();
	} catch (err) {
		logger.warn("Error stopping address manager", {
			error: normalizeError(err),
		});
	}
	_discovery = null;
	await app.shutdownSchedulers();
	try {
		await app.closeDb();
	} catch (err) {
		logger.warn("Error closing database", { error: normalizeError(err) });
	}
}
