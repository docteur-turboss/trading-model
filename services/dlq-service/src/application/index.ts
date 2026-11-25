import "./telemetry";
import { normalizeError } from "@trading-model/common/utils/errors";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { logger } from "@trading-model/http/logger";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
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

function _onStart(): void {
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
