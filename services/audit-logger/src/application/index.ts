import "./telemetry";
import { createBootstrap } from "@trading-model/http/bootstrap";
import { logger } from "@trading-model/http/logger";
import { shutdownTelemetry } from "@trading-model/http/telemetry";
import { DurationMs } from "@trading-model/primitives/primitives";
import { type AuditLoggerApp, createAuditLoggerApp } from "../config/container";
import { ENV } from "../infrastructure/config/env";

let _context: Omit<AuditLoggerApp, "server"> | null = null;

createBootstrap({
	name: "Audit Logger",
	createServer: async () => {
		const { server, ...resources } = await createAuditLoggerApp();
		_context = resources;

		return server;
	},
	onStart: () => {
		if (!_context) {
			return;
		}
		_context.chainAuditScheduler.start();
		logger.info("Audit Logger fully operational", {
			context: {
				port: ENV.PORT,
				mongoUri: ENV.MONGODB_URI,
			},
		});
	},
	// Grace 30 s: preStop 10 s, 5 s forced exit.
	shutdown: {
		onStopTimeoutMs: DurationMs.of(10_000),
		deadlineMs: DurationMs.of(14_000),
	},
	onStop: async () => {
		if (!_context) {
			await shutdownTelemetry();
			return;
		}
		const { brokerMessage, mongoManager, chainAuditScheduler } = _context;
		chainAuditScheduler.stop();
		await brokerMessage.stopMessageManager();
		await mongoManager.close();
		_context = null;
		await shutdownTelemetry();
	},
});
